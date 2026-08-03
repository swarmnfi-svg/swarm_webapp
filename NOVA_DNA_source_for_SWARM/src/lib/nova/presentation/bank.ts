/**
 * Polished bank formatters (deterministic_polished primary path).
 * bank_accounts_summary + bank_recon_summary — balances only when facts say visible.
 */

import {
  polishBullet,
  polishCount,
  polishJoin,
  polishMoney,
  polishNote,
  polishSection,
  polishTitle,
} from "@/lib/nova/presentation/layout";

export type BankAccountsSummaryFact = {
  balancesVisible?: unknown;
  totalOperationalBalanceInr?: unknown;
  totalBookBalanceInr?: unknown;
  totalStatementBalanceInr?: unknown;
  accountCount?: unknown;
  note?: unknown;
  accounts?: Array<{
    bank?: string;
    nickname?: string | null;
    bookBalanceInr?: string;
    id?: string;
  }>;
};

export function formatBankAccountsSummaryPolished(d: BankAccountsSummaryFact): string {
  const lines: string[] = [polishTitle("Bank accounts")];
  const count = polishCount(d.accountCount);

  lines.push("", `**${count}** active operational account(s).`);

  if (d.balancesVisible && d.totalOperationalBalanceInr) {
    lines.push(
      "",
      polishBullet(
        `Total operational balance: **${polishMoney(d.totalOperationalBalanceInr)}**`
      )
    );
    if (d.totalBookBalanceInr) {
      lines.push(
        polishBullet(
          `Book ${polishMoney(d.totalBookBalanceInr)} · Statement ${polishMoney(d.totalStatementBalanceInr)}`
        )
      );
    }
  }

  const accounts = d.accounts ?? [];
  if (d.balancesVisible && accounts.length) {
    lines.push("", polishSection("Accounts"));
    for (const a of accounts.slice(0, 5)) {
      const label = a.nickname || a.bank || "Account";
      lines.push(
        polishBullet(
          `${a.id ? `${a.id} ` : ""}${label} — book ${polishMoney(a.bookBalanceInr)}`
        )
      );
    }
  } else if (!d.balancesVisible && d.note) {
    lines.push("", polishNote(String(d.note)));
  }

  return polishJoin(lines);
}

export type BankReconSummaryFact = {
  unreconciledTotal?: unknown;
  oldestDays?: unknown;
  agingBuckets?: Record<string, number> | null;
  oldestSamples?: Array<{
    date?: string | null;
    bank?: string | null;
    direction?: string;
    amountInr?: string;
  }>;
  lastStatementUpload?: {
    uploadCount?: number;
    accountsWithUpload?: number;
    totalImported?: number;
    totalDuplicates?: number;
    recent?: Array<{
      file?: string;
      bank?: string | null;
      uploadedAt?: string;
      imported?: number;
    }>;
  };
  balancesVisible?: unknown;
  note?: unknown;
};

export function formatBankReconSummaryPolished(d: BankReconSummaryFact): string {
  const nUnrec = polishCount(d.unreconciledTotal);
  const lines: string[] = [polishTitle("Bank reconciliation")];

  if (nUnrec === 0) {
    lines.push("", "No unreconciled lines.");
  } else {
    lines.push("", "Unreconciled activity:", "", polishBullet(`**${nUnrec}** unreconciled line(s)`));
    if (d.oldestDays != null) {
      lines.push(polishBullet(`Oldest: **${d.oldestDays}** day(s)`));
    }
  }

  const aging = d.agingBuckets;
  if (aging && typeof aging === "object") {
    const parts = Object.entries(aging)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`);
    if (parts.length) {
      lines.push("", polishSection("Aging"), polishBullet(parts.join(" · ")));
    }
  }

  const oldest = d.oldestSamples ?? [];
  if (oldest.length) {
    lines.push("", polishSection("Oldest samples"));
    for (const s of oldest.slice(0, 5)) {
      lines.push(
        polishBullet(
          `${s.date ?? "—"} · ${s.bank ?? "—"} · ${s.direction ?? "—"} · ${polishMoney(s.amountInr)}`
        )
      );
    }
  }

  const upload = d.lastStatementUpload;
  if (upload) {
    lines.push(
      "",
      polishSection("Statement uploads"),
      polishBullet(
        `**${upload.uploadCount ?? 0}** file(s)` +
          (upload.accountsWithUpload != null
            ? ` · ${upload.accountsWithUpload} account(s) with a last upload`
            : "") +
          (upload.totalImported != null ? ` · ${upload.totalImported} imported` : "") +
          (upload.totalDuplicates != null ? ` · ${upload.totalDuplicates} duplicates` : "")
      )
    );
    for (const u of (upload.recent ?? []).slice(0, 3)) {
      lines.push(
        polishBullet(
          `${u.uploadedAt ?? "—"} · ${u.bank ?? "—"} · ${u.file ?? "file"}` +
            (u.imported != null ? ` (${u.imported} imported)` : "")
        )
      );
    }
  }

  if (d.balancesVisible === false) {
    lines.push("", polishNote("Account balances are hidden for your role."));
  }
  if (d.note) lines.push("", String(d.note));

  return polishJoin(lines);
}
