/// Truncate a string to at most `max_chars` Unicode scalar values, appending "…" if cut.
pub fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    format!("{}…", s.chars().take(max_chars).collect::<String>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_ascii() {
        assert_eq!(truncate_chars("hello world", 5), "hello…");
    }

    #[test]
    fn truncates_without_splitting_multibyte_chars() {
        // '・' is 3 bytes in UTF-8 — byte slicing at 117 would panic here
        let s = "日本語・テスト".repeat(20);
        let out = truncate_chars(&s, 40);
        assert!(out.ends_with('…'));
        assert!(std::str::from_utf8(out.as_bytes()).is_ok());
    }
}
