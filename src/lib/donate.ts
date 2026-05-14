// Edit this file to update donation destinations.
// Empty strings hide an entry.

export interface DonateEntry {
  kind: "crypto" | "link";
  label: string;
  value: string;     // crypto: address. link: URL.
  network?: string;  // crypto only: e.g. "Bitcoin", "Ethereum L1"
  note?: string;
}

export const DONATE_ENTRIES: DonateEntry[] = [
  {
    kind: "link",
    label: "Buy Me a Coffee",
    value: "https://buymeacoffee.com/cperos",
    note: "Card / Apple Pay / Google Pay",
  },
  {
    kind: "link",
    label: "Venmo",
    value: "https://venmo.com/u/Constantine-Peros",
    note: "@Constantine-Peros",
  },
  {
    kind: "link",
    label: "PayPal",
    value: "https://paypal.me/your-handle",
  },
  {
    kind: "link",
    label: "GitHub Sponsors",
    value: "https://github.com/sponsors/your-handle",
  },
  {
    kind: "crypto",
    label: "Bitcoin",
    network: "BTC",
    value: "[your-btc-address]",
  },
  {
    kind: "crypto",
    label: "Ethereum",
    network: "ETH (L1)",
    value: "[your-eth-address]",
  },
  {
    kind: "crypto",
    label: "USDC",
    network: "Base / Ethereum",
    value: "[your-usdc-address]",
  },
  {
    kind: "crypto",
    label: "Monero",
    network: "XMR",
    value: "[your-xmr-address]",
  },
];

export const DONATE_MESSAGE =
  "ISP Watchdog is free and open-source. If it helped you claw back a credit, consider chipping in — anything beats handing more money to the ISP.";
