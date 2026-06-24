/**
 * Seed Script — OPERO V1
 *
 * Target: tepat 5000 task di database
 * - Hapus semua task dengan ID format SEED-XXXXX (hasil seed lama)
 * - Pertahankan task asli (T-XXX)
 * - Tambah task baru dengan format ID T-{N} melanjutkan nomor tertinggi
 * - Semua field (organizationId, createdById, updatedById) identik dengan data asli
 *
 * Jalankan : npx tsx prisma/seed-tasks.ts
 * Reset    : npx tsx prisma/seed-tasks.ts --reset  (hanya hapus data seed, tidak insert)
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "",
  ssl: false,
  max: 10,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 10000,
});

// ──────────────────────────────────────────────────────────────
// Data variasi
// ──────────────────────────────────────────────────────────────
const STATUSES = ["Todo", "In Progress", "In Review", "Done", "Backlog"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent", null];

const TASK_TITLES = [
  "Review Draft Konten Mingguan",
  "Meeting Evaluasi Tim",
  "Buat Artikel Blog",
  "Rekrut Freelancer Baru",
  "Audit Kualitas Layanan",
  "Susun Kalender Konten Bulanan",
  "Update Portfolio Perusahaan",
  "Analisis Kompetitor",
  "Buat Proposal Penawaran",
  "Review Laporan Keuangan Bulanan",
  "Persiapan Demo Produk",
  "Onboarding Klien Baru",
  "Finalisasi Kontrak Kerjasama",
  "Update SOP Operasional",
  "Rapat Koordinasi Tim Marketing",
  "Buat Laporan Bulanan",
  "Riset Pasar Segmen Baru",
  "Revisi Desain Website",
  "Follow Up Klien Potensial",
  "Evaluasi Performa Kampanye",
  "Susun Anggaran Q3",
  "Buat Konten Sosial Media Mingguan",
  "Koordinasi Event Peluncuran Produk",
  "Update Database Kontak",
  "Review Feedback Pelanggan",
  "Perbaiki Alur Checkout",
  "Siapkan Materi Training Tim",
  "Audit SEO Website",
  "Buat Newsletter Bulan Ini",
  "Meeting dengan Investor",
  "Review KPI Tim Bulanan",
  "Perbarui Dokumen Legal",
  "Koordinasi Pengiriman Produk",
  "Buat Video Tutorial Produk",
  "Analisis Data Penjualan Mingguan",
  "Setup Tools Baru untuk Tim",
  "Rekap Hasil Meeting Klien",
  "Persiapan Laporan untuk Direksi",
  "Buat Rencana Kerja Bulanan",
  "Review dan Approve Budget",
  "Koordinasi Tim Support Pelanggan",
  "Update Strategi Digital Marketing",
  "Buat Template Presentasi Baru",
  "Evaluasi Vendor dan Supplier",
  "Rapat Planning Sprint Baru",
  "Review Kode Aplikasi Terbaru",
  "Siapkan Bahan Webinar",
  "Buat Panduan Pengguna",
  "Susun Laporan Akhir Tahun",
  "Koordinasi Dengan Tim Desain",
  "Optimasi Landing Page",
  "Riset Keyword untuk SEO",
  "Setup Google Analytics",
  "Buat Dashboard Monitoring",
  "Integrasi Sistem Pembayaran",
  "Testing Fitur Baru",
  "Dokumentasi API",
  "Review Pull Request Tim",
  "Deploy ke Production",
  "Backup Database Bulanan",
  "Optimasi Query Database",
  "Buat Unit Test",
  "Migrasi Data Legacy",
  "Setup CI/CD Pipeline",
  "Review Keamanan Aplikasi",
  "Buat Laporan Performa Server",
  "Update Dependency Library",
  "Refactor Kode Lama",
  "Buat Fitur Export Excel",
  "Implementasi Dark Mode",
  "Fix Bug Login Mobile",
  "Optimasi Loading Time",
  "Buat Notifikasi Push",
  "Implementasi SSO",
  "Review Aksesibilitas UI",
  "Buat Fitur Import CSV",
  "Setup Monitoring Alert",
  "Audit Log Aktivitas User",
  "Buat Laporan Mingguan Otomatis",
  "Review Kontrak Klien",
  "Negosiasi Harga Vendor",
  "Susun MoU Partnership",
  "Presentasi ke Client",
  "Buat Pitch Deck",
  "Follow Up Proposal",
  "Update CRM Data",
  "Kirim Invoice Bulanan",
  "Rekonsiliasi Keuangan",
  "Buat Laporan Pajak",
  "Review Asuransi Perusahaan",
  "Update Struktur Organisasi",
  "Buat Job Description Baru",
  "Proses Lamaran Kerja",
  "Jadwalkan Interview",
  "Onboarding Karyawan Baru",
  "Review Benefit Karyawan",
  "Buat Agenda Meeting Bulanan",
  "Susun OKR Kuartal",
  "Review Strategi Bisnis",
  "Buat Roadmap Produk",
];

const DESCRIPTIONS = [
  "Pastikan semua detail sudah lengkap sebelum deadline.",
  "Koordinasikan dengan tim terkait untuk memastikan kelancaran.",
  "Dokumentasikan hasil dan bagikan ke seluruh tim.",
  "Gunakan template standar yang sudah ada.",
  "Prioritas tinggi — selesaikan sebelum akhir minggu.",
  "Cek ulang data sebelum submit laporan.",
  "Konsultasikan dengan manager jika ada kendala.",
  "Update progress di project management tool.",
  "Siapkan backup plan jika ada kendala teknis.",
  "Feedback dari klien harus direspons dalam 24 jam.",
  "Koordinasi jadwal dengan semua stakeholder.",
  "Pastikan semua approval sudah didapatkan.",
  "Review bersama tim sebelum finalisasi.",
  "Catat semua keputusan dalam meeting notes.",
  "Bagikan hasilnya ke channel Slack tim.",
  null,
  null,
  null,
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDateOrNull(daysOffset: number, nullChance = 0.2): string | null {
  if (Math.random() < nullChance) return null;
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

function randCreatedAt(): Date {
  const now = new Date();
  const msBack = randInt(0, 180 * 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - msBack);
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
const TARGET = 5000;
const BATCH_SIZE = 100;

async function main() {
  const isReset = process.argv.includes("--reset");

  console.log("🌱 OPERO — Task Seed Script");
  console.log("=".repeat(50));

  // 1. Ambil referensi dari task asli
  const origResult = await pool.query<{
    id: string;
    organizationId: string;
    createdById: string;
    updatedById: string;
  }>(
    `SELECT id, "organizationId", "createdById", "updatedById"
     FROM task
     WHERE id ~ '^T-[0-9]+$'
     ORDER BY "createdAt" ASC
     LIMIT 1`
  );

  if (origResult.rows.length === 0) {
    throw new Error('❌ Tidak ditemukan task asli (format T-{N}). Pastikan data asli ada.');
  }

  const sample    = origResult.rows[0];
  const orgId     = sample["organizationId"];
  const createdById = sample["createdById"];
  const updatedById = sample["updatedById"];

  console.log(`✅ Organization ID : ${orgId}`);
  console.log(`✅ Created By ID   : ${createdById}`);

  // 2. Hapus semua task yang bukan asli (SEED-XXXXX atau format lain)
  const deleteResult = await pool.query(
    `DELETE FROM task
     WHERE "organizationId" = $1
       AND id NOT LIKE 'T-%'`,
    [orgId]
  );
  console.log(`🗑️  Dihapus ${deleteResult.rowCount} task non-asli`);

  if (isReset) {
    console.log("✅ Reset selesai.");
    return;
  }

  // 3. Hitung task T-{N} yang sudah ada dan cari nomor tertinggi
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM task WHERE "organizationId" = $1 AND id ~ '^T-[0-9]+$'`,
    [orgId]
  );
  const existing = parseInt(countResult.rows[0].count, 10);
  console.log(`📊 Task asli saat ini: ${existing}`);

  const toCreate = Math.max(0, TARGET - existing);

  if (toCreate === 0) {
    console.log(`✅ Sudah ada ${existing} task (≥ ${TARGET}). Tidak perlu tambah data.`);
    return;
  }

  // Cari nomor T-{N} tertinggi yang sudah ada
  const maxResult = await pool.query<{ maxnum: string }>(
    `SELECT MAX(CAST(REPLACE(id, 'T-', '') AS INTEGER)) as maxnum
     FROM task
     WHERE "organizationId" = $1 AND id ~ '^T-[0-9]+$'`,
    [orgId]
  );
  const maxNum = parseInt(maxResult.rows[0].maxnum ?? "0", 10);
  const startNum = maxNum + 1;

  console.log(`⏳ Akan membuat ${toCreate} task baru (T-${startNum} sampai T-${startNum + toCreate - 1})...`);
  console.log("");

  // 4. Insert dalam batch
  const totalBatches = Math.ceil(toCreate / BATCH_SIZE);
  let created = 0;

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchCount = Math.min(BATCH_SIZE, toCreate - batchStart);

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (let i = 0; i < batchCount; i++) {
      const taskNum   = startNum + batchStart + i;
      const taskId    = `T-${taskNum}`;
      const title     = rand(TASK_TITLES);
      const desc      = rand(DESCRIPTIONS);
      const status    = rand(STATUSES);
      const priority  = rand(PRIORITIES);
      const dueDate   = randDateOrNull(randInt(-30, 90));
      const startDate = randDateOrNull(randInt(-60, 0), 0.4);
      const createdAt = randCreatedAt();

      values.push(
        taskId, orgId, title, desc, status, priority,
        dueDate, startDate,
        null, null,
        "[]", "[]", "[]", "[]", "[]", "[]", "[]", null,
        createdById, updatedById, createdAt, createdAt
      );

      placeholders.push(`(
        $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++},
        $${paramIdx++}, $${paramIdx++}, $${paramIdx++}::timestamptz, $${paramIdx++}::timestamptz,
        $${paramIdx++}, $${paramIdx++},
        $${paramIdx++}::jsonb, $${paramIdx++}::jsonb, $${paramIdx++}::jsonb,
        $${paramIdx++}::jsonb, $${paramIdx++}::jsonb, $${paramIdx++}::jsonb, $${paramIdx++}::jsonb,
        $${paramIdx++}::jsonb,
        $${paramIdx++}, $${paramIdx++},
        $${paramIdx++}::timestamptz, $${paramIdx++}::timestamptz
      )`);
    }

    await pool.query(
      `INSERT INTO task (
        id, "organizationId", title, description, status, priority,
        "dueDate", "startDate", "assigneeId", "campaignId",
        labels, assignees, checklist, "externalLinks", comments, activity, attachments, payload,
        "createdById", "updatedById", "createdAt", "updatedAt"
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO NOTHING`,
      values
    );

    created += batchCount;

    if ((batch + 1) % 10 === 0 || batch + 1 === totalBatches) {
      const pct = Math.round((created / toCreate) * 100);
      process.stdout.write(
        `  → Batch ${batch + 1}/${totalBatches}: ${created}/${toCreate} task dibuat (${pct}%)\n`
      );
    }
  }

  // 5. Verifikasi
  const finalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM task WHERE "organizationId" = $1`,
    [orgId]
  );

  console.log("");
  console.log("=".repeat(50));
  console.log(`🎉 Selesai!`);
  console.log(`   • Task baru dibuat : ${created}`);
  console.log(`   • Total task       : ${finalResult.rows[0].count}`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
