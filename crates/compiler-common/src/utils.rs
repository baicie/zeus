//! Common utility functions used across compiler crates

use std::path::{Path, PathBuf};

/// Path utilities
pub mod path {
    use super::*;

    /// Normalize a file path
    pub fn normalize(path: &str) -> String {
        // Simple normalization - in a real implementation, you'd want more robust path handling
        path.replace("\\", "/")
    }

    /// Get the file extension
    pub fn extension(path: &str) -> Option<&str> {
        Path::new(path).extension()?.to_str()
    }

    /// Check if path is absolute
    pub fn is_absolute(path: &str) -> bool {
        Path::new(path).is_absolute()
    }

    /// Join path segments
    pub fn join(base: &str, segments: &[&str]) -> String {
        let mut path = PathBuf::from(base);
        for segment in segments {
            path.push(segment);
        }
        path.to_string_lossy().to_string()
    }

    /// Get relative path from base to target
    pub fn relative(from: &str, to: &str) -> String {
        // Simple implementation - in practice, you'd use a proper path library
        if to.starts_with(from) {
            to[from.len()..].trim_start_matches('/').to_string()
        } else {
            to.to_string()
        }
    }
}

/// String utilities
pub mod string {
    /// Convert camelCase to kebab-case
    pub fn camel_to_kebab(s: &str) -> String {
        let mut result = String::new();
        for (i, ch) in s.chars().enumerate() {
            if ch.is_uppercase() && i > 0 {
                result.push('-');
            }
            result.push(ch.to_lowercase().next().unwrap());
        }
        result
    }

    /// Convert kebab-case to camelCase
    pub fn kebab_to_camel(s: &str) -> String {
        let mut result = String::new();
        let mut capitalize_next = false;

        for ch in s.chars() {
            if ch == '-' {
                capitalize_next = true;
            } else if capitalize_next {
                result.push(ch.to_uppercase().next().unwrap());
                capitalize_next = false;
            } else {
                result.push(ch);
            }
        }
        result
    }

    /// Check if string is a valid identifier
    pub fn is_valid_identifier(s: &str) -> bool {
        if s.is_empty() {
            return false;
        }

        let mut chars = s.chars();
        let first = chars.next().unwrap();

        // First character must be a letter or underscore
        if !first.is_alphabetic() && first != '_' {
            return false;
        }

        // Subsequent characters can be letters, digits, or underscores
        for ch in chars {
            if !ch.is_alphanumeric() && ch != '_' {
                return false;
            }
        }

        true
    }

    /// Generate a unique identifier
    pub fn unique_id(prefix: &str) -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("{}_{}", prefix, timestamp)
    }
}

/// Collection utilities
pub mod collections {
    use std::collections::HashMap;
    use std::hash::Hash;

    /// Merge two hashmaps
    pub fn merge_hashmaps<K, V>(mut base: HashMap<K, V>, other: HashMap<K, V>) -> HashMap<K, V>
    where
        K: Eq + Hash + Clone,
    {
        for (key, value) in other {
            base.insert(key, value);
        }
        base
    }

    /// Deduplicate a vector while preserving order
    pub fn dedup<T: Eq + Clone + std::hash::Hash>(vec: Vec<T>) -> Vec<T> {
        let mut seen = std::collections::HashSet::new();
        vec.into_iter()
            .filter(|item| seen.insert(item.clone()))
            .collect()
    }

    /// Group items by a key function
    pub fn group_by<T, K, F>(items: Vec<T>, key_fn: F) -> HashMap<K, Vec<T>>
    where
        K: Eq + Hash,
        F: Fn(&T) -> K,
    {
        let mut groups = HashMap::new();
        for item in items {
            let key = key_fn(&item);
            groups.entry(key).or_insert_with(Vec::new).push(item);
        }
        groups
    }
}

/// Timing utilities
pub mod timing {
    use std::time::{Duration, Instant};

    /// Simple timer for measuring execution time
    pub struct Timer {
        start: Instant,
    }

    impl Timer {
        /// Start a new timer
        pub fn start() -> Self {
            Self {
                start: Instant::now(),
            }
        }

        /// Get elapsed time in milliseconds
        pub fn elapsed_ms(&self) -> u64 {
            self.start.elapsed().as_millis() as u64
        }

        /// Get elapsed time as Duration
        pub fn elapsed(&self) -> Duration {
            self.start.elapsed()
        }
    }

    /// Time a function execution
    pub fn time_function<F, R>(f: F) -> (R, u64)
    where
        F: FnOnce() -> R,
    {
        let timer = Timer::start();
        let result = f();
        let elapsed = timer.elapsed_ms();
        (result, elapsed)
    }
}

/// Async utilities
pub mod async_utils {
    use std::future::Future;
    use std::pin::Pin;
    use std::task::{Context, Poll};

    /// Simple timeout wrapper for futures
    pub struct Timeout<F> {
        future: Pin<Box<F>>,
        deadline: std::time::Instant,
    }

    impl<F> Timeout<F> {
        /// Create a new timeout wrapper
        pub fn new(future: F, duration: std::time::Duration) -> Self {
            Self {
                future: Box::pin(future),
                deadline: std::time::Instant::now() + duration,
            }
        }
    }

    impl<F: Future> Future for Timeout<F> {
        type Output = Result<F::Output, &'static str>;

        fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            if std::time::Instant::now() >= self.deadline {
                return Poll::Ready(Err("timeout"));
            }

            self.future.as_mut().poll(cx).map(Ok)
        }
    }

    /// Add timeout to a future
    pub fn with_timeout<F>(
        future: F,
        duration: std::time::Duration,
    ) -> Timeout<F> {
        Timeout::new(future, duration)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camel_to_kebab() {
        assert_eq!(string::camel_to_kebab("camelCase"), "camel-case");
        assert_eq!(string::camel_to_kebab("XMLHttpRequest"), "x-m-l-http-request");
    }

    #[test]
    fn test_kebab_to_camel() {
        assert_eq!(string::kebab_to_camel("kebab-case"), "kebabCase");
        assert_eq!(string::kebab_to_camel("multi-word-string"), "multiWordString");
    }

    #[test]
    fn test_is_valid_identifier() {
        assert!(string::is_valid_identifier("validName"));
        assert!(string::is_valid_identifier("_private"));
        assert!(!string::is_valid_identifier("123invalid"));
        assert!(!string::is_valid_identifier("invalid-name"));
    }

    #[test]
    fn test_timer() {
        let timer = timing::Timer::start();
        std::thread::sleep(std::time::Duration::from_millis(10));
        assert!(timer.elapsed_ms() >= 10);
    }

    #[test]
    fn test_time_function() {
        let (result, elapsed) = timing::time_function(|| {
            std::thread::sleep(std::time::Duration::from_millis(5));
            42
        });
        assert_eq!(result, 42);
        assert!(elapsed >= 5);
    }

    #[test]
    fn test_dedup() {
        let vec = vec![1, 2, 2, 3, 1, 4];
        let deduped = collections::dedup(vec);
        assert_eq!(deduped, vec![1, 2, 3, 4]);
    }

    #[test]
    fn test_group_by() {
        let items = vec![1, 2, 3, 4, 5, 6];
        let groups = collections::group_by(items, |&x| x % 2);
        assert_eq!(groups[&0], vec![2, 4, 6]);
        assert_eq!(groups[&1], vec![1, 3, 5]);
    }
}
