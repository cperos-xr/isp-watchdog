pub mod templates;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailDraft {
    pub template: String,
    pub to: String,
    pub subject: String,
    pub body: String,
}

/// Build a `mailto:` URI from a draft. Frontend opens it via the `opener` plugin.
pub fn mailto_url(draft: &EmailDraft) -> String {
    let to = urlencoding::encode(&draft.to);
    let subject = urlencoding::encode(&draft.subject);
    let body = urlencoding::encode(&draft.body);
    format!("mailto:{to}?subject={subject}&body={body}")
}
