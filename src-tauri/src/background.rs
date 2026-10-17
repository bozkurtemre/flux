//! Watching with the window closed. The watched queries and the deploy radar run in the main
//! window's webview, so closing the window while they have something to watch hides it instead:
//! Flux leaves the Dock and ⌘-Tab, and an icon in the menu bar is the way back to it, or out.
//! The front end decides when that is (App.tsx); this is how it is done.
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

const TRAY: &str = "background";

/// Hides the window and puts Flux in the menu bar, saying what it goes on watching.
#[tauri::command]
pub fn background_enter(app: AppHandle, status: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no main window")?;
    window.hide().map_err(|e| e.to_string())?;
    let _ = app.remove_tray_by_id(TRAY);
    let menu = Menu::with_items(
        &app,
        &[
            &MenuItem::with_id(&app, "background:status", status, false, None::<&str>)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(&app, "background:open", "Open Flux", true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &MenuItem::with_id(&app, "background:quit", "Quit Flux", true, None::<&str>)
                .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;
    // 18pt at 2x, black with the F cut out, as raw RGBA: a template image macOS colours itself
    let icon = tauri::image::Image::new(include_bytes!("../icons/tray.rgba"), 36, 36);
    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Flux is watching")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "background:open" => leave(app),
            // the window comes back first: quitting may ask about the terminals in it
            "background:quit" => {
                leave(app);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("quit", ());
                }
            }
            _ => {}
        })
        .build(&app)
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        awake::begin();
    }
    Ok(())
}

/// The window back for something that has to be seen: a link opened from outside.
#[tauri::command]
pub fn background_leave(app: AppHandle) {
    leave(&app);
}

/// The window back, and Flux in the Dock again. Nothing happens when it never left.
pub fn leave(app: &AppHandle) {
    if app.remove_tray_by_id(TRAY).is_none() {
        return;
    }
    #[cfg(target_os = "macos")]
    {
        awake::end();
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        #[cfg(debug_assertions)]
        dev_icon();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// A development build is no app bundle: its Dock icon is the one Tauri sets at launch, and
/// leaving the Dock takes it away, so back in the Dock it is set again. A release keeps its
/// bundle's icon, light, dark and tinted, and is left to it.
#[cfg(all(target_os = "macos", debug_assertions))]
fn dev_icon() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(include_bytes!("../icons/icon.icns"));
    if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
        unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
    }
}

/// With no window on screen, App Nap would stretch the rounds of a watch to whenever macOS
/// pleases; an activity keeps them on time and still lets the Mac sleep.
#[cfg(target_os = "macos")]
mod awake {
    use objc2::rc::Retained;
    use objc2::runtime::{NSObjectProtocol, ProtocolObject};
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    use std::cell::RefCell;

    thread_local! {
        // the command and the tray's menu both run on the main thread
        static ACTIVITY: RefCell<Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(None) };
    }

    pub fn begin() {
        ACTIVITY.with(|a| {
            let mut a = a.borrow_mut();
            if a.is_none() {
                *a = Some(
                    NSProcessInfo::processInfo().beginActivityWithOptions_reason(
                        NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
                        &NSString::from_str("Watching saved queries and deploys"),
                    ),
                );
            }
        });
    }

    pub fn end() {
        ACTIVITY.with(|a| {
            if let Some(token) = a.borrow_mut().take() {
                unsafe { NSProcessInfo::processInfo().endActivity(&token) };
            }
        });
    }
}
