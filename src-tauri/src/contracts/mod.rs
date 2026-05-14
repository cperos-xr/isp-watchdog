//! Bundled ISP catalog + lookups. v1 only ships static metadata; v1.1 will add
//! contract fetching/parsing.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IspEntry {
    pub id: &'static str,
    pub name: &'static str,
    pub support_email: Option<&'static str>,
    pub support_phone: Option<&'static str>,
    pub complaint_form_url: Option<&'static str>,
    pub terms_url: Option<&'static str>,
    pub notes: Option<&'static str>,
}

pub fn catalog() -> Vec<IspEntry> {
    vec![
        IspEntry {
            id: "spectrum",
            name: "Spectrum (Charter)",
            support_email: None,
            support_phone: Some("1-833-267-6094"),
            complaint_form_url: Some("https://www.spectrum.com/contact-us"),
            terms_url: Some("https://www.spectrum.com/policies/residential-terms"),
            notes: Some(
                "Spectrum's residential terms grant them broad latitude on \"up to\" speeds. Cite repeated and quantified shortfalls plus outage durations; reference their stated service guarantee.",
            ),
        },
        IspEntry {
            id: "comcast",
            name: "Comcast / Xfinity",
            support_email: None,
            support_phone: Some("1-800-934-6489"),
            complaint_form_url: Some("https://www.xfinity.com/support/contact-us"),
            terms_url: Some("https://www.xfinity.com/corporate/customers/policies/subscriberagreement"),
            notes: None,
        },
        IspEntry {
            id: "att",
            name: "AT&T",
            support_email: None,
            support_phone: Some("1-800-288-2020"),
            complaint_form_url: Some("https://www.att.com/support/contact-us/"),
            terms_url: Some("https://www.att.com/legal/terms.consumerServiceAgreement.html"),
            notes: None,
        },
        IspEntry {
            id: "verizon",
            name: "Verizon",
            support_email: None,
            support_phone: Some("1-800-837-4966"),
            complaint_form_url: Some("https://www.verizon.com/support/contact-us/"),
            terms_url: Some("https://www.verizon.com/about/terms-conditions/overview"),
            notes: None,
        },
        IspEntry {
            id: "cox",
            name: "Cox Communications",
            support_email: None,
            support_phone: Some("1-800-234-3993"),
            complaint_form_url: Some("https://www.cox.com/residential/contactus.html"),
            terms_url: Some("https://www.cox.com/aboutus/policies/annual-notice/subscriber-agreement.html"),
            notes: None,
        },
        IspEntry {
            id: "tmobile",
            name: "T-Mobile Home Internet",
            support_email: None,
            support_phone: Some("1-844-275-9310"),
            complaint_form_url: Some("https://www.t-mobile.com/contact-us"),
            terms_url: Some("https://www.t-mobile.com/responsibility/legal/terms-and-conditions"),
            notes: None,
        },
        IspEntry {
            id: "generic",
            name: "Other / Unknown",
            support_email: None,
            support_phone: None,
            complaint_form_url: None,
            terms_url: None,
            notes: Some("Fill in support details from your bill. Templates use placeholders."),
        },
    ]
}

pub fn fcc_complaint_url() -> &'static str {
    "https://consumercomplaints.fcc.gov/hc/en-us/requests/new?ticket_form_id=39744"
}
