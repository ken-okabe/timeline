// main.rs
use timeline::{Timeline, Nullable, ThreadSafeTimeline};
use std::fmt::Debug;

fn log<A: Debug>(a: A) {
    println!("{:?}", a);
}

fn main() {
    println!("--------------------------------------------");
    // Example 1: String Timeline
    let timeline_ref: Timeline<Nullable<String>> = Timeline::new(Nullable::null());

    let _mapped_timeline = timeline_ref.map(|value| {
        log(&value);
        value
    });

    timeline_ref.next("Hello");
    timeline_ref.next("World!");
    timeline_ref.next("Rust");
    timeline_ref.next(Nullable::null());

    println!("--------------------------------------------");
    // Example 2: Int Timeline (directly using numbers)
    let timeline_int: Timeline<Nullable<i32>> = Timeline::new(Nullable::null());

    let _mapped_int_timeline = timeline_int.map(|value| {
        log(&value);
        value
    });

    timeline_int.next(1);
    timeline_int.next(2);
    timeline_int.next(3);
    timeline_int.next(Nullable::null());

    println!("--------------------------------------------");
    // Example 3: Command Object Timeline
    #[derive(Debug, Clone)]
    struct CommandObj {
        cmd: &'static str,
        msg: &'static str,
    }
    // Initialize Timeline with Null
    let timeline_obj: Timeline<Nullable<CommandObj>> = Timeline::new(Nullable::null());
    // Map the Timeline
    // If the value is Null, do nothing
    // Otherwise, log the value
    // This behavior is similar to Promise .then() method
    let _mapped_cmd_timeline = timeline_obj.map(|value| {
        if !value.is_null() {
            if let Some(cmd_obj) = value.get() {
                println!("cmd: {}, msg: {}", cmd_obj.cmd, cmd_obj.msg);
            }
        }
        value
    });

    timeline_obj.next(CommandObj {
        cmd: "text",
        msg: "Hello",
    });

    timeline_obj.next(CommandObj {
        cmd: "text",
        msg: "Bye",
    });

    timeline_obj.next(Nullable::null()); // do nothing
    
    println!("--------------------------------------------");
    // Example 4: Using Nullable's new map method
    let timeline_messages: Timeline<Nullable<String>> = Timeline::new(Nullable::null());
    
    let _mapped_messages = timeline_messages.map(|nullable_str| {
        // Using the new map method on Nullable
        let upper_nullable = nullable_str.map(|s| s.to_uppercase());
        log(&upper_nullable);
        nullable_str
    });
    
    timeline_messages.next("hello world");
    timeline_messages.next(Nullable::null());
    
    println!("--------------------------------------------");
    // Example 5: Using ThreadSafeTimeline for multithreaded context
    let thread_safe_timeline: ThreadSafeTimeline<Nullable<i32>> = ThreadSafeTimeline::new(Nullable::null());
    
    // Create a thread that updates the timeline
    let timeline_clone = thread_safe_timeline.clone();
    let handle = std::thread::spawn(move || {
        for i in 1..5 {
            timeline_clone.next(i);
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });
    
    // Main thread reads the last value
    for _ in 0..5 {
        println!("Main thread sees: {:?}", thread_safe_timeline.last());
        std::thread::sleep(std::time::Duration::from_millis(90));
    }
    
    // Wait for the thread to complete
    handle.join().unwrap();
}