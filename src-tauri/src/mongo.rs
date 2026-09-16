//! Read-only access to a watchdog MongoDB. The webview cannot speak the Mongo wire
//! protocol, so every query crosses this boundary. Nothing here writes.

use futures::TryStreamExt;
use mongodb::bson::{Bson, Document};
use mongodb::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Collections Flux is allowed to read. Anything else is refused.
const READABLE: &[&str] = &[
    "metric_buckets",
    "error_records",
    "alerts",
    "deployments",
    "source_locations",
    "notifications",
    "cursors",
];

/// Aggregation stages that would modify the database.
const WRITE_STAGES: &[&str] = &["$out", "$merge"];

#[derive(Default)]
pub struct Pool(Arc<Mutex<HashMap<String, Client>>>);

impl Pool {
    async fn get(&self, uri: &str) -> Result<Client, String> {
        let mut map = self.0.lock().await;
        if let Some(c) = map.get(uri) {
            return Ok(c.clone());
        }
        let client = Client::with_uri_str(uri).await.map_err(|e| e.to_string())?;
        map.insert(uri.to_string(), client.clone());
        Ok(client)
    }
}

fn database(client: &Client, uri: &str) -> mongodb::Database {
    // mongodb://host/watchdog -> "watchdog"; fall back to the conventional name
    let name = uri
        .rsplit('/')
        .next()
        .map(|s| s.split('?').next().unwrap_or(s))
        .filter(|s| !s.is_empty() && !s.contains(':'))
        .unwrap_or("watchdog");
    client.database(name)
}

fn check(collection: &str, pipeline: &[Value]) -> Result<(), String> {
    if !READABLE.contains(&collection) {
        return Err(format!("collection `{collection}` is not readable by Flux"));
    }
    for stage in pipeline {
        if let Value::Object(map) = stage {
            for key in map.keys() {
                if WRITE_STAGES.contains(&key.as_str()) {
                    return Err(format!("stage `{key}` writes; Flux is read-only"));
                }
            }
        }
    }
    Ok(())
}

fn to_doc(v: &Value) -> Result<Document, String> {
    match Bson::try_from(v.clone()).map_err(|e| e.to_string())? {
        Bson::Document(d) => Ok(d),
        other => Err(format!("expected an object, got {other:?}")),
    }
}

/// Dates and ObjectIds do not survive plain JSON, so they are rendered as strings.
fn json_of(doc: Document) -> Value {
    fn walk(b: Bson) -> Value {
        match b {
            Bson::DateTime(d) => Value::String(d.try_to_rfc3339_string().unwrap_or_default()),
            Bson::ObjectId(o) => Value::String(o.to_hex()),
            Bson::Document(d) => Value::Object(d.into_iter().map(|(k, v)| (k, walk(v))).collect()),
            Bson::Array(a) => Value::Array(a.into_iter().map(walk).collect()),
            Bson::Int32(i) => Value::from(i),
            Bson::Int64(i) => Value::from(i),
            Bson::Double(f) => Value::from(f),
            Bson::Boolean(x) => Value::Bool(x),
            Bson::Null => Value::Null,
            Bson::String(s) => Value::String(s),
            other => Value::String(format!("{other}")),
        }
    }
    walk(Bson::Document(doc))
}

#[tauri::command]
pub async fn mongo_ping(pool: tauri::State<'_, Pool>, uri: String) -> Result<String, String> {
    let client = pool.get(&uri).await?;
    let db = database(&client, &uri);
    let info = db
        .run_command(mongodb::bson::doc! { "buildInfo": 1 })
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "{} · db {}",
        info.get_str("version").unwrap_or("unknown"),
        db.name()
    ))
}

#[tauri::command]
pub async fn mongo_aggregate(
    pool: tauri::State<'_, Pool>,
    uri: String,
    collection: String,
    pipeline: Vec<Value>,
) -> Result<Vec<Value>, String> {
    check(&collection, &pipeline)?;
    let client = pool.get(&uri).await?;
    let stages = pipeline.iter().map(to_doc).collect::<Result<Vec<_>, _>>()?;
    let cursor = database(&client, &uri)
        .collection::<Document>(&collection)
        .aggregate(stages)
        .await
        .map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    Ok(docs.into_iter().map(json_of).collect())
}

#[tauri::command]
pub async fn mongo_distinct(
    pool: tauri::State<'_, Pool>,
    uri: String,
    collection: String,
    field: String,
    filter: Value,
) -> Result<Vec<Value>, String> {
    check(&collection, &[])?;
    let client = pool.get(&uri).await?;
    let values = database(&client, &uri)
        .collection::<Document>(&collection)
        .distinct(&field, to_doc(&filter)?)
        .await
        .map_err(|e| e.to_string())?;
    Ok(values
        .into_iter()
        .map(|b| match json_of(mongodb::bson::doc! { "v": b }) {
            Value::Object(mut m) => m.remove("v").unwrap_or(Value::Null),
            _ => Value::Null,
        })
        .collect())
}

/// Read a local text file, used for the optional watchdog.config.yaml.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}
