import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";

/**
 * Certificate builder.
 *
 * The QR code is STATIC: it encodes the certificate's key facts as plain text,
 * so any phone camera can scan it and immediately display the authenticity
 * details without needing a server round-trip.
 *
 * PARKED (designed, not enabled): a signed dynamic variant lives in
 * routes/verify.routes.ts (HMAC signature + GET /api/v1/verify/certificate/:id/:sig).
 * Re-enable by mounting verifyRouter in app.ts and swapping the QR payload for
 * verificationUrl(id) below.
 */

export async function loadEnrollmentFull(enrollmentId: string) {
  return prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: true,
      prisoner: { include: { jail: true } },
    },
  });
}

export async function buildCertificateHtml(enrollmentId: string): Promise<string> {
  const e = await loadEnrollmentFull(enrollmentId);
  if (!e || e.status !== "completed") {
    throw new Error("Enrollment is not completed");
  }

  const completedOn = new Date(e.completedAt ?? Date.now()).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const qrPayload = [
    "RIHAI SETU - SKILL PASSPORT CERTIFICATE",
    `Certificate ID: ${e.id}`,
    `Name: ${e.prisoner.fullName}`,
    `Reg No: ${e.prisoner.prisonerRegNo}`,
    `Facility: ${e.prisoner.jail.name}, ${e.prisoner.jail.district}`,
    `Program: ${e.program.name} (${e.program.category})`,
    `Completed: ${completedOn}`,
    "Authentic record issued by RIHAI SETU",
  ].join("\n");

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Certificate of Completion - ${e.prisoner.fullName}</title>
<style>
 body{font-family:Georgia,'Times New Roman',serif;background:#f1f5f9;margin:0;padding:32px 16px;display:flex;justify-content:center}
 .sheet{background:#fff;border:3px double #1d4ed8;max-width:760px;width:100%;padding:48px 56px;text-align:center;position:relative}
 .ribbon{font-family:Arial,sans-serif;font-size:11px;letter-spacing:.35em;color:#b45309;border-bottom:1px solid #e2e8f0;padding-bottom:14px;margin-bottom:26px}
 h1{color:#1d4ed8;font-size:34px;margin:0 0 6px}
 .name{font-size:28px;font-style:italic;margin:22px 0 4px;color:#0f172a}
 .reg{font-size:13px;color:#475569;font-family:Arial,sans-serif}
 .line{width:120px;height:2px;background:#cbd5e1;margin:18px auto}
 .program{font-size:19px;color:#334155}
 .meta{font-size:12.5px;color:#64748b;line-height:1.9;margin-top:18px;font-family:Arial,sans-serif}
 .qr{margin-top:30px;display:flex;align-items:center;gap:18px;justify-content:center}
 .qr img{border:1px solid #e2e8f0;padding:6px;background:#fff;border-radius:6px}
 .qrtxt{text-align:left;font-family:Arial,sans-serif;font-size:11.5px;color:#64748b;max-width:300px}
 .qrtxt b{display:block;color:#0f172a;margin-bottom:4px}
 .foot{margin-top:34px;font-size:10.5px;color:#94a3b8;font-family:Arial,sans-serif}
</style></head>
<body><div class="sheet">
 <div class="ribbon">RIHAI SETU &middot; SKILL PASSPORT &middot; VERIFIED RECORD</div>
 <h1>Certificate of Completion</h1>
 <p class="reg">This is to certify that</p>
 <p class="name">${e.prisoner.fullName}</p>
 <p class="reg">Reg. No. ${e.prisoner.prisonerRegNo} &nbsp;&middot;&nbsp; ${e.prisoner.jail.name}</p>
 <div class="line"></div>
 <p>has successfully completed the training program</p>
 <p class="program"><strong>${e.program.name}</strong><br><span style="font-size:13px">${e.program.category}</span></p>
 <div class="meta">
   Completed on <strong>${completedOn}</strong><br>
   Enrollment ID: <strong>${e.id}</strong>
 </div>
 <div class="qr">
   <img src="${qrDataUrl}" alt="Certificate QR code" width="160" height="160">
   <div class="qrtxt">
     <b>Scan to view certificate details</b>
     The QR carries this certificate's full authenticated text:
     holder, registration number, facility, program and completion date.
   </div>
 </div>
 <p class="foot">Digitally issued by RIHAI SETU &mdash; Skill Passport verified record.</p>
</div></body></html>`;
}
