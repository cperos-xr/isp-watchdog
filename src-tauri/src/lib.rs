pub mod commands;
pub mod contracts;
pub mod db;
pub mod evidence;
pub mod mail;
pub mod probes;
pub mod scheduler;

use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;

use crate::db::DbPool;
use crate::scheduler::{SchedulerConfig, SchedulerHandle};

pub struct AppState {
    pub pool: DbPool,
    pub scheduler: SchedulerHandle,
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let dir = data_dir(&handle);
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("data.db");
            let pool = db::open(&db_path).expect("open db");
            let scheduler = scheduler::spawn(pool.clone(), SchedulerConfig::default());
            handle.manage(AppState { pool, scheduler });

            build_tray(&handle)?;

            // Hide window if launched with --silent (autostart path).
            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|a| a == "--silent") {
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::dashboard_snapshot,
            commands::list_measurements,
            commands::list_events,
            commands::save_plan,
            commands::get_active_plan,
            commands::get_thresholds,
            commands::save_thresholds,
            commands::case_report,
            commands::isp_catalog,
            commands::fcc_url,
            commands::draft_email,
            commands::build_mailto,
            commands::run_throughput_now,
            commands::save_personal,
            commands::list_equipment,
            commands::save_equipment,
            commands::quit_app,
            commands::export_markdown,
            commands::save_markdown_report,
            commands::get_pollinations_key,
            commands::save_pollinations_key,
            commands::get_pollinations_model,
            commands::save_pollinations_model,
            commands::pollinations_account_snapshot,
            commands::pollinations_device_start,
            commands::pollinations_device_token_poll,
            commands::pollinations_generate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Dashboard", true, None::<&str>)?;
    let run_now = MenuItem::with_id(app, "run_now", "Run Speed Test Now", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "—", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &run_now, &separator, &quit])?;

    let _ = TrayIconBuilder::with_id("main")
        .tooltip("ISP Watchdog")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "run_now" => {
                if let Some(state) = app.try_state::<AppState>() {
                    let _ = crate::commands::run_throughput_now(state);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
