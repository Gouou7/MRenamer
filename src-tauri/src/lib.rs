pub mod engine;
pub mod model;
pub mod platform;
pub mod rules;
pub mod storage;

#[cfg(feature = "desktop")]
mod desktop {
    use crate::{engine::Engine, model::*};
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Manager};
    struct State(Arc<Mutex<Engine>>);
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
            .invoke_handler(tauri::generate_handler![
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
