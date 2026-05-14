//! Handlebars renderer for the bundled escalation templates.
//!
//! The templates ship inside the binary via `include_str!` so the app works
//! without a separate templates directory at runtime. Community-contributed
//! templates can be added by extending the `BUILTIN_TEMPLATES` table.

use anyhow::Result;
use handlebars::Handlebars;
use serde::Serialize;

use crate::db::repo::Equipment;
use crate::evidence::CaseReport;

#[derive(Debug, Clone, Copy, Serialize)]
pub enum Tier {
    FirstContact,
    FormalComplaint,
    Regulator,
    LegalNotice,
}

impl Tier {
    pub fn key(&self) -> &'static str {
        match self {
            Tier::FirstContact => "first_contact",
            Tier::FormalComplaint => "formal_complaint",
            Tier::Regulator => "regulator",
            Tier::LegalNotice => "legal_notice",
        }
    }
}

const FIRST_CONTACT: &str = include_str!("../../../templates/first_contact.hbs");
const FORMAL_COMPLAINT: &str = include_str!("../../../templates/formal_complaint.hbs");
const REGULATOR: &str = include_str!("../../../templates/regulator.hbs");
const LEGAL_NOTICE: &str = include_str!("../../../templates/legal_notice.hbs");

fn template_body(tier: Tier) -> &'static str {
    match tier {
        Tier::FirstContact => FIRST_CONTACT,
        Tier::FormalComplaint => FORMAL_COMPLAINT,
        Tier::Regulator => REGULATOR,
        Tier::LegalNotice => LEGAL_NOTICE,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TemplateContext {
    pub customer_name: String,
    pub account_number: Option<String>,
    pub isp_name: String,
    pub support_email: Option<String>,
    pub plan_name: String,
    pub advertised_down: f64,
    pub advertised_up: f64,
    pub monthly_cost: Option<f64>,
    pub currency: String,
    pub report: CaseReport,
    pub today: String,
    pub requested_credit: Option<f64>,
    pub equipment: Vec<Equipment>,
}

pub fn render(tier: Tier, ctx: &TemplateContext) -> Result<String> {
    let mut hb = Handlebars::new();
    hb.set_strict_mode(false);
    hb.register_helper("fmt2", Box::new(fmt2));
    hb.register_helper("pct", Box::new(pct));
    let body = hb.render_template(template_body(tier), ctx)?;
    Ok(body)
}

handlebars::handlebars_helper!(fmt2: |v: f64| format!("{:.2}", v));
handlebars::handlebars_helper!(pct:  |v: f64| format!("{:.0}%", v * 100.0));

/// Suggested credit = monthly_cost * underdelivery_ratio * months_affected
pub fn suggested_credit(report: &CaseReport, monthly_cost: f64, months: u32) -> Option<f64> {
    let (advertised, measured) = (
        report.summary.advertised_down?,
        report.summary.median_down_mbps?,
    );
    if advertised <= 0.0 {
        return None;
    }
    let shortfall = (1.0 - measured / advertised).clamp(0.0, 1.0);
    Some(monthly_cost * shortfall * months as f64)
}
