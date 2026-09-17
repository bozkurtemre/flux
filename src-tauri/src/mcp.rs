//! An MCP server, for as long as the window is open. It speaks JSON-RPC over HTTP on the
//! loopback interface so an agent in a terminal can read the same logs the window is
//! showing, through the same connections.
//!
//! The tools themselves are not implemented here. Everything Flux knows about Graylog — the
//! client, the field mapping, the endpoint derivation — is in the front end, so a call is
//! handed to the window and its answer is handed back. This file is the socket, the protocol
//! and the waiting.
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// How long a tool call may take before the caller is told it did not answer. Long enough for
/// a slow aggregation over a busy stream, short enough that nothing waits for ever.
const CALL_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Mcp {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Default)]
struct Inner {
    /// The tool list the window registered, served as it was given.
    tools: Value,
    /// Calls waiting for the window to answer them.
    pending: HashMap<String, oneshot::Sender<Value>>,
    running: Option<Running>,
}

struct Running {
    port: u16,
    token: String,
    stop: Option<oneshot::Sender<()>>,
}

#[derive(serde::Serialize)]
pub struct Status {
    running: bool,
    port: u16,
    token: String,
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// One JSON-RPC message. `None` means the message was a notification and has no reply.
async fn handle_rpc(app: AppHandle, state: Arc<Mutex<Inner>>, message: Value) -> Option<Value> {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");

    match method {
        "initialize" => Some(rpc_result(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "flux", "version": env!("CARGO_PKG_VERSION") },
            }),
        )),
        "notifications/initialized" => None,
        "ping" => Some(rpc_result(id, json!({}))),
        "tools/list" => {
            let tools = state.lock().unwrap().tools.clone();
            Some(rpc_result(
                id,
                json!({ "tools": if tools.is_null() { json!([]) } else { tools } }),
            ))
        }
        "tools/call" => {
            let name = message
                .get("params")
                .and_then(|p| p.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let arguments = message
                .get("params")
                .and_then(|p| p.get("arguments"))
                .cloned()
                .unwrap_or_else(|| json!({}));

            let call_id = uuid();
            let (tx, rx) = oneshot::channel();
            state.lock().unwrap().pending.insert(call_id.clone(), tx);

            let Some(window) = app.get_webview_window("main") else {
                state.lock().unwrap().pending.remove(&call_id);
                return Some(rpc_error(id, -32603, "the window is not there to answer"));
            };
            if window
                .emit(
                    "mcp-call",
                    json!({ "id": call_id, "name": name, "arguments": arguments }),
                )
                .is_err()
            {
                state.lock().unwrap().pending.remove(&call_id);
                return Some(rpc_error(id, -32603, "the window could not be asked"));
            }

            match tokio::time::timeout(CALL_TIMEOUT, rx).await {
                Ok(Ok(result)) => Some(rpc_result(id, result)),
                _ => {
                    state.lock().unwrap().pending.remove(&call_id);
                    Some(rpc_error(id, -32603, "the window did not answer in time"))
                }
            }
        }
        other => Some(rpc_error(id, -32601, &format!("no such method: {other}"))),
    }
}

/// Random enough for a correlation id, without a crate for it.
fn uuid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}{:x}", std::process::id())
}

#[tauri::command]
pub async fn mcp_start(
    port: u16,
    token: String,
    app: AppHandle,
    mcp: State<'_, Mcp>,
) -> Result<Status, String> {
    // Asking for the server that is already running is not a restart. The window asks twice
    // on every mount in development, and taking the first one down to put an identical one
    // up raced the port and left neither.
    {
        let inner = mcp.inner.lock().unwrap();
        if let Some(r) = &inner.running {
            if r.port == port && r.token == token {
                return Ok(Status {
                    running: true,
                    port: r.port,
                    token: r.token.clone(),
                });
            }
        }
    }
    stop_running(&mcp);

    // the listener a stopped server held is dropped by its own task, a moment later
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut bound = None;
    for attempt in 0..20 {
        match TcpListener::bind(addr).await {
            Ok(l) => {
                bound = Some(l);
                break;
            }
            Err(e) if attempt == 19 => return Err(e.to_string()),
            Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    }
    let listener = bound.ok_or("could not bind")?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let (stop_tx, mut stop_rx) = oneshot::channel();
    {
        let mut inner = mcp.inner.lock().unwrap();
        inner.running = Some(Running {
            port,
            token: token.clone(),
            stop: Some(stop_tx),
        });
    }

    let state = Arc::clone(&mcp.inner);
    tauri::async_runtime::spawn(async move {
        loop {
            let accepted = tokio::select! {
                _ = &mut stop_rx => break,
                accepted = listener.accept() => accepted,
            };
            let Ok((stream, _)) = accepted else { continue };

            let app = app.clone();
            let state = Arc::clone(&state);
            let token = token.clone();
            tauri::async_runtime::spawn(async move {
                let service = service_fn(move |req: Request<hyper::body::Incoming>| {
                    let app = app.clone();
                    let state = Arc::clone(&state);
                    let token = token.clone();
                    async move {
                        // the loopback interface is shared with every other process on this
                        // machine, so the token is what makes this the agent's server and
                        // not anybody's
                        let offered = req
                            .headers()
                            .get("authorization")
                            .and_then(|v| v.to_str().ok())
                            .map(|v| v.trim_start_matches("Bearer ").to_string())
                            .unwrap_or_default();
                        if offered != token {
                            return Ok::<_, hyper::Error>(
                                Response::builder()
                                    .status(StatusCode::UNAUTHORIZED)
                                    .body(Full::new(Bytes::from("unauthorized")))
                                    .unwrap(),
                            );
                        }

                        let body = req.into_body().collect().await?.to_bytes();
                        let answer = match serde_json::from_slice::<Value>(&body) {
                            Ok(Value::Array(messages)) => {
                                let mut out = Vec::new();
                                for message in messages {
                                    if let Some(reply) =
                                        handle_rpc(app.clone(), Arc::clone(&state), message).await
                                    {
                                        out.push(reply);
                                    }
                                }
                                if out.is_empty() {
                                    None
                                } else {
                                    Some(Value::Array(out))
                                }
                            }
                            Ok(message) => {
                                handle_rpc(app.clone(), Arc::clone(&state), message).await
                            }
                            Err(e) => Some(rpc_error(Value::Null, -32700, &e.to_string())),
                        };

                        let (status, payload) = match answer {
                            Some(value) => (StatusCode::OK, value.to_string()),
                            None => (StatusCode::ACCEPTED, String::new()),
                        };
                        Ok(Response::builder()
                            .status(status)
                            .header("content-type", "application/json")
                            .body(Full::new(Bytes::from(payload)))
                            .unwrap())
                    }
                });

                let _ = hyper::server::conn::http1::Builder::new()
                    .serve_connection(TokioIo::new(stream), service)
                    .await;
            });
        }
    });

    Ok(mcp_status_inner(&mcp))
}

fn stop_running(mcp: &State<'_, Mcp>) {
    let mut inner = mcp.inner.lock().unwrap();
    if let Some(mut running) = inner.running.take() {
        if let Some(stop) = running.stop.take() {
            let _ = stop.send(());
        }
    }
}

#[tauri::command]
pub async fn mcp_stop(mcp: State<'_, Mcp>) -> Result<Status, String> {
    stop_running(&mcp);
    Ok(mcp_status_inner(&mcp))
}

fn mcp_status_inner(mcp: &State<'_, Mcp>) -> Status {
    let inner = mcp.inner.lock().unwrap();
    match &inner.running {
        Some(r) => Status {
            running: true,
            port: r.port,
            token: r.token.clone(),
        },
        None => Status {
            running: false,
            port: 0,
            token: String::new(),
        },
    }
}

#[tauri::command]
pub async fn mcp_status(mcp: State<'_, Mcp>) -> Result<Status, String> {
    Ok(mcp_status_inner(&mcp))
}

/// The window says what it can do; the server repeats it to whoever asks.
#[tauri::command]
pub async fn mcp_set_tools(tools: Value, mcp: State<'_, Mcp>) -> Result<(), String> {
    mcp.inner.lock().unwrap().tools = tools;
    Ok(())
}

/// The window's answer to one call, matched to the request that is still waiting for it.
#[tauri::command]
pub async fn mcp_respond(id: String, result: Value, mcp: State<'_, Mcp>) -> Result<(), String> {
    let sender = mcp.inner.lock().unwrap().pending.remove(&id);
    match sender {
        Some(tx) => {
            let _ = tx.send(result);
            Ok(())
        }
        None => Err("nothing was waiting for that answer".into()),
    }
}
