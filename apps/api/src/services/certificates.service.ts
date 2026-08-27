import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import { piiPublic } from "../lib/pii.js";
import { config } from "../config.js";

export async function loadEnrollmentFull(enrollmentId: string) {
  return prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: true,
      prisoner: { include: { jail: true } },
    },
  });
}

export async function getCertificateVerification(enrollmentId: string) {
  const e = await loadEnrollmentFull(enrollmentId);
  if (!e || e.status !== "completed") return null;

  const prisonerName = piiPublic(e.prisoner).fullName;
  const certCode = `CERT-2026-${e.id.toUpperCase().slice(-8)}`;

  return {
    valid: true,
    certificateCode: certCode,
    enrollmentId: e.id,
    prisonerName,
    prisonerRegNo: e.prisoner.prisonerRegNo,
    gender: e.prisoner.gender,
    jailName: e.prisoner.jail.name,
    jailDistrict: e.prisoner.jail.district,
    jailState: e.prisoner.jail.state,
    jailCode: e.prisoner.jail.code,
    programName: e.program.name,
    category: e.program.category,
    completedAt: e.completedAt?.toISOString() ?? new Date().toISOString(),
    verificationUrl: `${config.WEB_ORIGIN}/verify/certificate/${e.id}`,
    certificateUrl: e.certificateUrl,
  };
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

  const prisonerName = piiPublic(e.prisoner).fullName;
  const certCode = `CERT-2026-${e.id.toUpperCase().slice(-8)}`;
  const publicVerifyUrl = `${config.WEB_ORIGIN}/verify/certificate/${e.id}`;

  const qrDataUrl = await QRCode.toDataURL(publicVerifyUrl, {
    width: 260,
    margin: 1,
    color: { dark: "#1E293B", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Official Skill Passport & Certificate - ${prisonerName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #F8FAFC;
    color: #1E293B;
    margin: 0;
    padding: 32px 16px;
    display: flex;
    justify-content: center;
  }
  .cert-card {
    background: #FFFFFF;
    border: 3px double #D9531E;
    border-radius: 16px;
    max-width: 820px;
    width: 100%;
    padding: 48px 56px;
    position: relative;
    box-shadow: 0 12px 36px rgba(30, 41, 59, 0.08);
    overflow: hidden;
  }
  .cert-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 8px;
    background: linear-gradient(90deg, #D9531E 0%, #F5A623 50%, #D9531E 100%);
  }
  .header-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #EEE4D6;
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .logo-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-icon {
    background: linear-gradient(135deg, #D9531E, #F5A623);
    color: #FFFFFF;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.5px;
  }
  .logo-title {
    font-size: 20px;
    font-weight: 800;
    color: #1E293B;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }
  .logo-sub {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #64748B;
    font-weight: 600;
  }
  .cert-code-badge {
    background: #FFF6EC;
    border: 1px solid #EEE4D6;
    color: #D9531E;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    font-family: monospace;
  }
  .cert-body {
    text-align: center;
  }
  .cert-tag {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #D9531E;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 32px;
    font-weight: 800;
    color: #1E293B;
    margin: 0 0 16px 0;
    letter-spacing: -0.5px;
  }
  .certify-text {
    font-size: 14px;
    color: #64748B;
    margin-bottom: 8px;
  }
  .recipient-name {
    font-size: 30px;
    font-weight: 800;
    color: #D9531E;
    margin: 8px 0;
    letter-spacing: -0.5px;
  }
  .recipient-meta {
    font-size: 13.5px;
    color: #475569;
    font-weight: 500;
    margin-bottom: 24px;
  }
  .divider-gold {
    width: 140px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #F5A623, transparent);
    margin: 20px auto;
  }
  .course-box {
    background: #FFF6EC;
    border: 1px solid #EEE4D6;
    border-radius: 12px;
    padding: 20px;
    margin: 20px 0;
    display: inline-block;
    width: 100%;
    max-width: 580px;
  }
  .course-name {
    font-size: 22px;
    font-weight: 800;
    color: #1E293B;
    margin-bottom: 4px;
  }
  .course-cat {
    font-size: 13px;
    font-weight: 600;
    color: #D9531E;
    background: rgba(217, 83, 30, 0.1);
    display: inline-block;
    padding: 3px 12px;
    border-radius: 12px;
  }
  .verification-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    border-top: 2px dashed #EEE4D6;
    padding-top: 28px;
    margin-top: 36px;
    text-align: left;
  }
  .qr-container {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .qr-container img {
    border: 2px solid #EEE4D6;
    border-radius: 10px;
    padding: 6px;
    background: #FFFFFF;
  }
  .qr-info h4 {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 700;
    color: #1E293B;
  }
  .qr-info p {
    margin: 0 0 6px 0;
    font-size: 11.5px;
    color: #64748B;
    line-height: 1.4;
  }
  .verify-link {
    font-size: 11px;
    color: #D9531E;
    font-weight: 600;
    word-break: break-all;
    text-decoration: none;
  }
  .seal-badge {
    border: 2px solid #10B981;
    background: #ECFDF5;
    color: #065F46;
    padding: 12px 18px;
    border-radius: 12px;
    text-align: center;
    min-width: 170px;
  }
  .seal-title {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    display: block;
    margin-bottom: 2px;
  }
  .seal-sub {
    font-size: 10px;
    font-weight: 600;
  }
</style>
</head>
<body>
  <div class="cert-card">
    <div class="header-brand">
      <div class="logo-box">
        <div class="logo-icon">RS</div>
        <div>
          <div class="logo-title">RIHAI SETU</div>
          <div class="logo-sub">Rehabilitation &amp; Skill Passport</div>
        </div>
      </div>
      <div class="cert-code-badge">${certCode}</div>
    </div>

    <div class="cert-body">
      <div class="cert-tag">SKILL PASSPORT &middot; OFFICIAL RECORD</div>
      <h1>Certificate of Completion</h1>
      <p class="certify-text">This document certifies that</p>
      <div class="recipient-name">${prisonerName}</div>
      <div class="recipient-meta">
        Prisoner Reg. No: <strong>${e.prisoner.prisonerRegNo}</strong> &nbsp;&middot;&nbsp; 
        Facility: <strong>${e.prisoner.jail.name}, ${e.prisoner.jail.district}</strong>
      </div>

      <div class="divider-gold"></div>

      <p class="certify-text">has successfully completed the certified vocational skill program</p>
      
      <div class="course-box">
        <div class="course-name">${e.program.name}</div>
        <div class="course-cat">${e.program.category}</div>
      </div>

      <p style="font-size: 13px; color: #64748B; margin-top: 12px;">
        Issued on <strong>${completedOn}</strong> &middot; Verified by Jail Administration
      </p>
    </div>

    <div class="verification-footer">
      <div class="qr-container">
        <img src="${qrDataUrl}" alt="Verification QR Code" width="120" height="120">
        <div class="qr-info">
          <h4>Scan to Verify Authenticity</h4>
          <p>Scan with any camera to validate official authenticity on the public RIHAI SETU portal.</p>
          <a href="${publicVerifyUrl}" target="_blank" class="verify-link">${publicVerifyUrl}</a>
        </div>
      </div>

      <div class="seal-badge">
        <span class="seal-title">&check; VERIFIED RECORD</span>
        <span class="seal-sub">AUTHENTICATED ON-CHAIN</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}
