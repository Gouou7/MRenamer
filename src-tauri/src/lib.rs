pub mod engine;
pub mod model;
pub mod platform;
pub mod rules;
pub mod storage;
pub mod template;

#[cfg(feature = "desktop")]
mod desktop {
    use crate::{engine::Engine, model::*};
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Manager};
    struct State(Arc<Mutex<Engine>>);
    #[tauri::command]
    async fn open_settings(app: tauri::AppHandle) -> Result<()> {
        // Build on a worker thread to avoid the Windows synchronous-command WebView2 deadlock.
        tauri::async_runtime::spawn_blocking(move || {
            static CREATION: Mutex<()> = Mutex::new(());
            let _guard = CREATION
                .lock()
                .map_err(|_| AppError::new("settingsOpen", "state"))?;
            let window = if let Some(window) = app.get_webview_window("settings") {
                window
            } else {
                let config = app
                    .config()
                    .app
                    .windows
                    .iter()
                    .find(|window| window.label == "settings")
                    .ok_or_else(|| AppError::new("settingsOpen", "configuration"))?;
                tauri::WebviewWindowBuilder::from_config(&app, config)
                    .and_then(|builder| builder.build())
                    .map_err(|error| AppError::new("settingsOpen", error))?
            };
            window
                .unminimize()
                .and_then(|_| window.show())
                .and_then(|_| window.set_focus())
                .map_err(|error| AppError::new("settingsOpen", error))
        })
        .await
        .map_err(|error| AppError::new("settingsOpen", error))?
    }
    #[tauri::command]
    fn list_variables() -> Vec<crate::template::VariableDefinition> {
        crate::template::variables().to_vec()
    }
    #[tauri::command]
    fn system_accent_color() -> Option<[u8; 3]> {
        #[cfg(windows)]
        {
            use windows::UI::ViewManagement::{UIColorType, UISettings};
            let color = UISettings::new()
                .ok()?
                .GetColorValue(UIColorType::Accent)
                .ok()?;
            Some([color.R, color.G, color.B])
        }
        #[cfg(target_os = "macos")]
        {
            use objc2_app_kit::{NSColor, NSColorSpace};
            // System colors are dynamic and may use a non-RGB color space.
            let color = NSColor::controlAccentColor()
                .colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
            let channels = [
                color.redComponent(),
                color.greenComponent(),
                color.blueComponent(),
            ];
            if channels.iter().any(|channel| !channel.is_finite()) {
                return None;
            }
            Some(channels.map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8))
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        None
    }

    #[cfg(all(test, target_os = "macos"))]
    #[test]
    fn macos_accent_can_be_read_as_rgb() {
        assert!(system_accent_color().is_some());
    }
    async fn task<T: Send + 'static>(
        engine: Arc<Mutex<Engine>>,
        work: impl FnOnce(&mut Engine) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        tauri::async_runtime::spawn_blocking(move || {
            let mut engine = engine
                .lock()
                .map_err(|_| AppError::new("internal", "state"))?;
            work(&mut engine)
        })
        .await
        .map_err(|e| AppError::new("internal", e))?
    }
    #[tauri::command]
    async fn scan_entries(
        state: tauri::State<'_, State>,
        app: tauri::AppHandle,
        paths: Vec<String>,
        contents: bool,
        recursive: bool,
    ) -> Result<Vec<FileEntry>> {
        task(state.0.clone(), move |e| {
            e.scan(paths, contents, recursive, &|p| {
                let _ = app.emit("operation-progress", p);
            })
        })
        .await
    }
    #[tauri::command]
    async fn preview_rename(
        state: tauri::State<'_, State>,
        ids: Vec<String>,
        selected: Vec<String>,
        rules: Vec<RenameRule>,
        revision: u64,
    ) -> Result<RenamePlan> {
        task(state.0.clone(), move |e| {
            e.preview(ids, selected, rules, revision)
        })
        .await
    }
    #[tauri::command]
    async fn execute_rename(
        state: tauri::State<'_, State>,
        app: tauri::AppHandle,
        plan_id: String,
    ) -> Result<HistoryEntry> {
        task(state.0.clone(), move |e| {
            e.execute(&plan_id, &|p| {
                let _ = app.emit("operation-progress", p);
            })
        })
        .await
    }
    #[tauri::command]
    async fn list_history(state: tauri::State<'_, State>) -> Result<Vec<HistoryEntry>> {
        task(state.0.clone(), move |e| e.journal.history()).await
    }
    #[tauri::command]
    async fn undo_rename(
        state: tauri::State<'_, State>,
        app: tauri::AppHandle,
        operation_id: String,
    ) -> Result<HistoryEntry> {
        task(state.0.clone(), move |e| {
            e.undo(&operation_id, &|p| {
                let _ = app.emit("operation-progress", p);
            })
        })
        .await
    }
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(|app, _, _| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::SIZE
                            | tauri_plugin_window_state::StateFlags::MAXIMIZED
                            | tauri_plugin_window_state::StateFlags::VISIBLE,
                    )
                    .build(),
            )
            .setup(|app| {
                let data = app.path().app_data_dir()?;
                std::fs::create_dir_all(&data)?;
                let engine = Engine::open(&crate::storage::history_path(&data))
                    .map_err(|e| std::io::Error::other(e.detail))?;
                app.manage(State(Arc::new(Mutex::new(engine))));
                Ok(())
            })
            .on_window_event(|window, event| {
                if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                    if let Some(settings) = window.app_handle().get_webview_window("settings") {
                        let _ = settings.close();
                    }
                }
            })
            .invoke_handler(tauri::generate_handler![
                system_accent_color,
                list_variables,
                open_settings,
                scan_entries,
                preview_rename,
                execute_rename,
                list_history,
                undo_rename
            ])
            .run(tauri::generate_context!())
            .expect("Unable to start MRenamer");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;
