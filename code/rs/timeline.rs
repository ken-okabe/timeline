// timeline.rs
use std::cell::RefCell;
use std::rc::Rc;
use std::fmt::Debug;
use std::panic::AssertUnwindSafe;

#[derive(Clone)]
pub struct Nullable<T: Clone + 'static> {
    inner: Option<T>,
}

impl<T: Clone + 'static> Nullable<T> {
    pub fn new(value: Option<T>) -> Self {
        Nullable { inner: value }
    }

    pub fn null() -> Self {
        Nullable { inner: None }
    }

    pub fn is_null(&self) -> bool {
        self.inner.is_none()
    }

    pub fn get(&self) -> Option<&T> {
        self.inner.as_ref()
    }
    
    // Added mapping operation for better usability
    pub fn map<U: Clone + 'static, F: FnOnce(&T) -> U>(&self, f: F) -> Nullable<U> {
        match &self.inner {
            Some(value) => Nullable::new(Some(f(value))),
            None => Nullable::null(),
        }
    }
}

impl<T: Clone + Default + 'static> Nullable<T> {
    // Added default value support
    pub fn unwrap_or_default(&self) -> T {
        self.inner.clone().unwrap_or_default()
    }
}

impl From<&str> for Nullable<String> {
    fn from(s: &str) -> Self {
        Nullable { inner: Some(s.to_string()) }
    }
}

impl<T: Clone + 'static> From<T> for Nullable<T> {
    fn from(value: T) -> Self {
        Nullable { inner: Some(value) }
    }
}

impl<T: Clone + Debug + 'static> Debug for Nullable<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.inner {
            Some(value) => write!(f, "{:?}", value),
            None => write!(f, "null"),
        }
    }
}

#[derive(Clone)]
pub struct Timeline<A: Clone + 'static> {
    last: Rc<RefCell<A>>,
    fns: Rc<RefCell<Vec<Box<dyn Fn(A) -> ()>>>>,
}

impl<A: Clone + 'static> Timeline<A> {
    pub fn new(initial_value: A) -> Self {
        Timeline {
            last: Rc::new(RefCell::new(initial_value)),
            fns: Rc::new(RefCell::new(Vec::new())),
        }
    }

    pub fn last(&self) -> A {
        self.last.borrow().clone()
    }

    pub fn next<T: Into<A>>(&self, a: T) {
        *self.last.borrow_mut() = a.into();
        
        // Safely execute callbacks with error handling
        let callbacks = self.fns.borrow();
        for f in callbacks.iter() {
            let cloned_value = self.last.borrow().clone();
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                f(cloned_value);
            }));
            
            if result.is_err() {
                eprintln!("Error executing timeline callback");
            }
        }
    }

    pub fn bind<B: Clone + 'static>(&self, monadf: impl Fn(A) -> Timeline<B> + 'static) -> Timeline<B> {
        let timeline_b = monadf(self.last());
        let timeline_b_clone = timeline_b.clone();

        // Store a clone of timeline_b in the closure
        let new_fn = Box::new(move |a: A| {
            let inner_timeline = monadf(a.clone());
            timeline_b_clone.next(inner_timeline.last());
        });

        self.fns.borrow_mut().push(new_fn);
        timeline_b
    }

    pub fn map<B: Clone + 'static>(&self, f: impl Fn(A) -> B + 'static) -> Timeline<B> {
        let timeline_b = Timeline::new(f(self.last()));
        let timeline_b_clone = timeline_b.clone();

        // Store a clone of timeline_b in the closure
        let new_fn = Box::new(move |a: A| {
            timeline_b_clone.next(f(a.clone()));
        });

        self.fns.borrow_mut().push(new_fn);
        timeline_b
    }

    pub fn unlink(&self) {
        self.fns.borrow_mut().clear();
    }
}

// Implement Drop without requiring Debug
impl<A: Clone + 'static> Drop for Timeline<A> {
    fn drop(&mut self) {
        self.unlink();
    }
}

// Thread-safe version using Arc and Mutex
use std::sync::{Arc, Mutex, RwLock};

pub struct ThreadSafeTimeline<A: Clone + Send + Sync + 'static> {
    last: Arc<RwLock<A>>,
    fns: Arc<Mutex<Vec<Box<dyn Fn(A) -> () + Send + Sync>>>>,
}

impl<A: Clone + Send + Sync + 'static> ThreadSafeTimeline<A> {
    pub fn new(initial_value: A) -> Self {
        ThreadSafeTimeline {
            last: Arc::new(RwLock::new(initial_value)),
            fns: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn last(&self) -> A {
        match self.last.read() {
            Ok(guard) => guard.clone(),
            Err(_) => panic!("RwLock poisoned in ThreadSafeTimeline::last"),
        }
    }

    pub fn next<T: Into<A> + Send>(&self, a: T) {
        // Update the value
        match self.last.write() {
            Ok(mut guard) => *guard = a.into(),
            Err(_) => {
                eprintln!("Failed to update ThreadSafeTimeline value - RwLock poisoned");
                return;
            }
        }
        
        // Execute callbacks
        let callbacks = match self.fns.lock() {
            Ok(guard) => guard,
            Err(_) => {
                eprintln!("Failed to execute callbacks - Mutex poisoned");
                return;
            }
        };
        
        let current_value = self.last();
        for f in callbacks.iter() {
            // Using AssertUnwindSafe to allow catch_unwind to work with any closure
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                f(current_value.clone());
            }));
            
            if result.is_err() {
                eprintln!("Error executing thread-safe timeline callback");
            }
        }
    }
    
    pub fn map<B: Clone + Send + Sync + 'static>(&self, f: impl Fn(A) -> B + Send + Sync + 'static) -> ThreadSafeTimeline<B> {
        let current = self.last();
        let timeline_b = ThreadSafeTimeline::new(f(current));
        let timeline_b_clone = timeline_b.clone();
        
        let new_fn = Box::new(move |a: A| {
            timeline_b_clone.next(f(a));
        });
        
        if let Ok(mut callbacks) = self.fns.lock() {
            callbacks.push(new_fn);
        }
        
        timeline_b
    }
    
    pub fn unlink(&self) {
        if let Ok(mut callbacks) = self.fns.lock() {
            callbacks.clear();
        }
    }
}

impl<A: Clone + Send + Sync + 'static> Clone for ThreadSafeTimeline<A> {
    fn clone(&self) -> Self {
        ThreadSafeTimeline {
            last: Arc::clone(&self.last),
            fns: Arc::clone(&self.fns),
        }
    }
}

impl<A: Clone + Send + Sync + 'static> Drop for ThreadSafeTimeline<A> {
    fn drop(&mut self) {
        self.unlink();
    }
}