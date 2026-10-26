//! Liquid Glass (macOS 26) under a webview — today the recording overlay's card.
//!
//! A webview cannot sample what lies behind its window, so CSS can never draw
//! real glass. Instead a native `NSGlassEffectView` sits under the webview, and
//! the page reports where it wants the glass every frame its card changes
//! (`overlay::set_card_frame`). Earlier macOS has no such class, and the page
//! keeps drawing its own opaque card.

use crate::overlay::CardFrame;
use tauri::WebviewWindow;

/// Whether this Mac can draw Liquid Glass.
#[cfg(target_os = "macos")]
pub fn supported() -> bool {
    objc2::runtime::AnyClass::get(c"NSGlassEffectView").is_some()
}

#[cfg(not(target_os = "macos"))]
pub fn supported() -> bool {
    false
}

/// Puts a glass view under the window's webview, hidden until the page places it.
pub fn install(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        // Directly when already on the main thread (app setup), so it is in
        // place before the page loads and reports.
        if objc2::MainThreadMarker::new().is_some() {
            mac::install(window);
        } else {
            let target = window.clone();
            let _ = window.run_on_main_thread(move || mac::install(&target));
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

/// Moves the window's glass to where its page asked for it.
pub fn set_frame(window: &WebviewWindow, frame: CardFrame) {
    #[cfg(target_os = "macos")]
    {
        let label = window.label().to_string();
        let _ = window.run_on_main_thread(move || mac::update(&label, frame));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, frame);
}

#[cfg(target_os = "macos")]
mod mac {
    use crate::overlay::CardFrame;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSGlassEffectView, NSGlassEffectViewStyle, NSView, NSWindow, NSWindowOrderingMode,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use std::cell::RefCell;
    use std::collections::HashMap;

    /// A window's glass and the content view it lives in.
    struct Installed {
        glass: Retained<NSGlassEffectView>,
        parent: Retained<NSView>,
    }

    thread_local! {
        // AppKit views belong to the main thread, and so do these, per window label.
        static VIEWS: RefCell<HashMap<String, Installed>> = RefCell::new(HashMap::new());
    }

    pub fn install(window: &tauri::WebviewWindow) {
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        if !super::supported() {
            return;
        }
        let Ok(ns_window) = window.ns_window() else {
            return;
        };
        // SAFETY: Tauri hands out the live NSWindow of this webview window.
        let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
        let Some(content) = ns_window.contentView() else {
            return;
        };
        let view = NSGlassEffectView::new(mtm);
        view.setStyle(NSGlassEffectViewStyle::Regular);
        view.setAlphaValue(0.0);
        // Below every sibling, i.e. under the webview.
        content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
        VIEWS.with(|views| {
            views.borrow_mut().insert(
                window.label().to_string(),
                Installed {
                    glass: view,
                    parent: content,
                },
            )
        });
        log::info!("Liquid Glass under the '{}' window", window.label());
    }

    pub fn update(label: &str, frame: CardFrame) {
        VIEWS.with(|views| {
            let views = views.borrow();
            let Some(Installed { glass, parent }) = views.get(label) else {
                return;
            };
            // The page measures from the top, AppKit from the bottom.
            let y = parent.bounds().size.height - frame.y - frame.height;
            glass.setFrame(NSRect::new(
                NSPoint::new(frame.x, y),
                NSSize::new(frame.width, frame.height),
            ));
            glass.setCornerRadius(frame.radius);
            glass.setAlphaValue(frame.opacity);
        });
    }
}
