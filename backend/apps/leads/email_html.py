# ruff: noqa: E501  (inline-styled email HTML has long lines by nature)
"""The branded HTML version of a lead email: ARQUS colours and logo, table layout, inline styles.

Email clients ignore most modern CSS, so this is a table layout with every style inline. The logo is
embedded in the message (Content-ID) rather than linked, so it shows even when remote images are blocked.
The plain-text body is always sent too (multipart/alternative).
"""

from email.mime.image import MIMEImage
from html import escape
from pathlib import Path

from django.core.mail import EmailMultiAlternatives

LOGO_PATH = Path(__file__).parent / "email_assets" / "logo.png"
LOGO_CID = "arqus-logo"

# Colours and links taken from https://arqussportsconsultancy.com/
CYAN = "#2FC1FF"
BLUE = "#2575FC"
GOLD = "#FEC42D"
INK = "#111827"
MUTED = "#6B7280"
SITE = "https://arqussportsconsultancy.com/"
FACEBOOK = "https://www.facebook.com/arqussportsconsultancy/"
INSTAGRAM = "https://www.instagram.com/arqussportsconsultancy/"

FONT = "'Lato','Segoe UI',Helvetica,Arial,sans-serif"


def _paragraphs(text: str) -> str:
    """Plain text to HTML: blank lines split paragraphs, single newlines become <br>."""
    blocks = [b.strip("\n") for b in text.replace("\r\n", "\n").split("\n\n") if b.strip()]
    return "".join(
        f'<p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:{INK};">'
        f'{escape(block).replace(chr(10), "<br>")}</p>'
        for block in blocks
    )


def render_html(subject: str, text: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF3F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(text[:110])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF3F8;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:10px;overflow:hidden;
                box-shadow:0 2px 10px rgba(17,24,39,0.08);">
    <tr><td height="6" style="height:6px;line-height:6px;font-size:6px;background-color:{CYAN};
            background-image:linear-gradient(90deg,{CYAN},{BLUE});">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#FFFFFF" style="padding:28px 24px 18px 24px;background-color:#FFFFFF;">
      <a href="{SITE}" style="text-decoration:none;">
        <img src="cid:{LOGO_CID}" width="170" alt="ARQUS Sports Consultancy"
             style="display:block;width:170px;max-width:100%;height:auto;border:0;outline:none;">
      </a>
    </td></tr>
    <tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;background-color:#E5E7EB;">&nbsp;</div></td></tr>
    <tr><td style="padding:30px 40px 12px 40px;font-family:{FONT};">
      <h1 style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;
                 font-weight:normal;color:{INK};">{escape(subject)}</h1>
      {_paragraphs(text)}
    </td></tr>
    <tr><td style="padding:8px 40px 30px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="{GOLD}" style="border-radius:6px;background-color:{GOLD};">
          <a href="{SITE}" style="display:inline-block;padding:12px 26px;font-family:{FONT};font-size:14px;
             font-weight:bold;color:{INK};text-decoration:none;border-radius:6px;">Visit our website</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td align="center" bgcolor="#F8FAFC" style="padding:22px 24px;background-color:#F8FAFC;
            border-top:1px solid #E5E7EB;font-family:{FONT};">
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:bold;color:{INK};">ARQUS Sports Consultancy</p>
      <p style="margin:0 0 12px 0;font-size:12px;color:{MUTED};">Idealize. Innovate. Achieve. &middot; Pune, India</p>
      <p style="margin:0;font-size:12px;">
        <a href="{SITE}" style="color:{BLUE};text-decoration:none;">Website</a>
        <span style="color:#D1D5DB;">&nbsp;|&nbsp;</span>
        <a href="{FACEBOOK}" style="color:{BLUE};text-decoration:none;">Facebook</a>
        <span style="color:#D1D5DB;">&nbsp;|&nbsp;</span>
        <a href="{INSTAGRAM}" style="color:{BLUE};text-decoration:none;">Instagram</a>
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""


def build_message(
    subject: str,
    text: str,
    from_email: str,
    to: str,
    reply_to: str | None,
    headers: dict,
    connection=None,
) -> EmailMultiAlternatives:
    """The plain text plus the branded HTML (with the embedded logo) as one message."""
    message = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=from_email,
        to=[to],
        reply_to=[reply_to] if reply_to else None,
        headers=headers,
        connection=connection,
    )
    message.attach_alternative(render_html(subject, text), "text/html")
    message.mixed_subtype = "related"  # the logo belongs to the HTML part
    if LOGO_PATH.exists():
        logo = MIMEImage(LOGO_PATH.read_bytes(), _subtype="png")
        logo.add_header("Content-ID", f"<{LOGO_CID}>")
        logo.add_header("Content-Disposition", "inline", filename="arqus-logo.png")
        message.attach(logo)
    return message
