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
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #0F172A;
    color: #1E293B;
    margin: 0;
    padding: 40px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }
  .cert-card {
    background: #FFFFFF;
    border: 12px solid #1E293B;
    outline: 3px solid #F5A623;
    outline-offset: -8px;
    border-radius: 20px;
    max-width: 880px;
    width: 100%;
    padding: 50px 60px;
    position: relative;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  /* Corner Ornaments */
  .corner-gold {
    position: absolute;
    width: 40px;
    height: 40px;
    border: 3px solid #F5A623;
  }
  .corner-tl { top: 16px; left: 16px; border-right: none; border-bottom: none; }
  .corner-tr { top: 16px; right: 16px; border-left: none; border-bottom: none; }
  .corner-bl { bottom: 16px; left: 16px; border-right: none; border-top: none; }
  .corner-br { bottom: 16px; right: 16px; border-left: none; border-top: none; }

  /* Background Watermark Logo */
  .cert-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 260px;
    font-weight: 900;
    color: rgba(217, 83, 30, 0.03);
    user-select: none;
    pointer-events: none;
    font-family: 'Cinzel', serif;
    letter-spacing: -10px;
  }

  .header-brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #E2E8F0;
    padding-bottom: 24px;
    margin-bottom: 32px;
  }
  .logo-box {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .logo-badge {
    background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
    border: 2px solid #D9531E;
    color: #FFFFFF;
    width: 52px;
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 20px;
    box-shadow: 0 4px 10px rgba(217, 83, 30, 0.25);
  }
  .logo-title {
    font-family: 'Cinzel', serif;
    font-size: 24px;
    font-weight: 800;
    color: #1E293B;
    letter-spacing: 0.05em;
    line-height: 1.1;
  }
  .logo-sub {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #D9531E;
    font-weight: 800;
    margin-top: 2px;
  }
  .cert-code-badge {
    background: #FFF6EC;
    border: 1.5px solid #FDBA74;
    color: #C2410C;
    padding: 8px 16px;
    border-radius: 30px;
    font-size: 12px;
    font-weight: 800;
    font-family: monospace;
    letter-spacing: 0.05em;
  }

  .cert-body {
    text-align: center;
    position: relative;
    z-index: 2;
  }
  .cert-tag {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #D9531E;
    margin-bottom: 10px;
  }
  h1 {
    font-family: 'Cinzel', serif;
    font-size: 36px;
    font-weight: 800;
    color: #0F172A;
    margin: 0 0 14px 0;
    letter-spacing: 0.02em;
  }
  .certify-text {
    font-size: 14px;
    color: #64748B;
    font-weight: 500;
    margin-bottom: 8px;
  }
  .recipient-name {
    font-family: 'Cinzel', serif;
    font-size: 34px;
    font-weight: 800;
    color: #D9531E;
    margin: 10px 0;
    letter-spacing: 0.02em;
    text-decoration: underline;
    text-decoration-color: #FDBA74;
    text-underline-offset: 8px;
  }
  .recipient-meta {
    font-size: 13px;
    color: #334155;
    font-weight: 600;
    margin-top: 14px;
    margin-bottom: 24px;
  }
  .divider-gold {
    width: 180px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #F5A623, transparent);
    margin: 22px auto;
  }
  .course-box {
    background: linear-gradient(135deg, #FFF6EC 0%, #FFEDD5 100%);
    border: 1.5px solid #FDBA74;
    border-radius: 14px;
    padding: 22px;
    margin: 22px auto;
    display: inline-block;
    width: 100%;
    max-width: 600px;
    box-shadow: 0 4px 12px rgba(217, 83, 30, 0.06);
  }
  .course-name {
    font-size: 22px;
    font-weight: 800;
    color: #0F172A;
    margin-bottom: 6px;
  }
  .course-cat {
    font-size: 12px;
    font-weight: 800;
    color: #C2410C;
    background: #FFFFFF;
    border: 1px solid #FDBA74;
    display: inline-block;
    padding: 4px 14px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  
  .verification-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    border-top: 2px dashed #E2E8F0;
    padding-top: 24px;
    margin-top: 32px;
    text-align: left;
    position: relative;
    z-index: 2;
  }
  .qr-container {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .qr-container img {
    border: 2px solid #CBD5E1;
    border-radius: 10px;
    padding: 6px;
    background: #FFFFFF;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  }
  .qr-info h4 {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 800;
    color: #0F172A;
  }
  .qr-info p {
    margin: 0 0 6px 0;
    font-size: 11px;
    color: #64748B;
    line-height: 1.4;
  }
  .verify-link {
    font-size: 10.5px;
    color: #D9531E;
    font-weight: 700;
    word-break: break-all;
    text-decoration: none;
  }
  .seal-badge {
    border: 2px solid #059669;
    background: #ECFDF5;
    color: #065F46;
    padding: 14px 20px;
    border-radius: 14px;
    text-align: center;
    min-width: 180px;
    box-shadow: 0 4px 6px rgba(5, 150, 105, 0.1);
  }
  .seal-title {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    display: block;
    margin-bottom: 2px;
  }
  .seal-sub {
    font-size: 9.5px;
    font-weight: 700;
  }
</style>
</head>
<body>
  <div class="cert-card">
    <!-- Corner Ornaments -->
    <div class="corner-gold corner-tl"></div>
    <div class="corner-gold corner-tr"></div>
    <div class="corner-gold corner-bl"></div>
    <div class="corner-gold corner-br"></div>

    <!-- Watermark Logo -->
    <div class="cert-watermark">RS</div>

    <div class="header-brand">
      <div class="logo-box">
        <div class="logo-badge">RS</div>
        <div>
          <div class="logo-title">RIHAI SETU</div>
          <div class="logo-sub">Official Skill Passport &amp; Rehabilitation Registry</div>
        </div>
      </div>
      <div class="cert-code-badge">${certCode}</div>
    </div>

    <div class="cert-body">
      <div class="cert-tag">PRISON INDUSTRIES &middot; OFFICIAL VOCATIONAL CERTIFICATE</div>
      <h1>Certificate of Completion</h1>
      <p class="certify-text">This official state document hereby certifies that</p>
      <div class="recipient-name">${prisonerName}</div>
      <div class="recipient-meta">
        Prisoner Reg. No: <strong>${e.prisoner.prisonerRegNo}</strong> &nbsp;&middot;&nbsp; 
        Facility: <strong>${e.prisoner.jail.name}, ${e.prisoner.jail.district}</strong>
      </div>

      <div class="divider-gold"></div>

      <p class="certify-text">has successfully completed the verified in-custody trade training course</p>
      
      <div class="course-box">
        <div class="course-name">${e.program.name}</div>
        <div class="course-cat">${e.program.category}</div>
      </div>

      <p style="font-size: 12.5px; color: #64748B; margin-top: 14px; font-weight: 600;">
        Issued on <strong>${completedOn}</strong> &middot; Authenticated by Jail Vocational Training Directorate
      </p>
    </div>

    <div class="verification-footer">
      <div class="qr-container">
        <img src="${qrDataUrl}" alt="Verification QR Code" width="110" height="110">
        <div class="qr-info">
          <h4>Public QR Verification</h4>
          <p>Scan with any mobile camera to verify digital authenticity on Rihai-Setu portal.</p>
          <a href="${publicVerifyUrl}" target="_blank" class="verify-link">${publicVerifyUrl}</a>
        </div>
      </div>

      <div class="seal-badge">
        <span class="seal-title">&check; VERIFIED RECORD</span>
        <span class="seal-sub">AUTHENTICATED DIGITAL CERTIFICATE</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}
