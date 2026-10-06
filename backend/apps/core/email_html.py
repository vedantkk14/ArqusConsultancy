# ruff: noqa: E501  (inline-styled email HTML has long lines by nature)
"""The branded HTML version of an ARQUS email (lead emails, sign-in codes).

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
NAVY = "#0B1F3A"
INK = "#1E293B"
BODY = "#475569"
MUTED = "#94A3B8"
PAGE = "#EEF2F7"
SITE = "https://arqussportsconsultancy.com/"
FACEBOOK = "https://www.facebook.com/arqussportsconsultancy/"
INSTAGRAM = "https://www.instagram.com/arqussportsconsultancy/"

# One clean sans-serif family everywhere: no serif heading, no heavy weights.
FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif"

_SIGN_OFFS = ("regards", "best regards", "warm regards", "thanks", "thank you", "sincerely", "cheers")

_BUTTON = f"""    <tr><td style="padding:6px 40px 8px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="{GOLD}" style="border-radius:999px;background-color:{GOLD};">
          <a href="{SITE}" style="display:inline-block;padding:13px 30px;font-family:{FONT};font-size:14px;
             font-weight:600;letter-spacing:0.2px;color:{NAVY};text-decoration:none;border-radius:999px;">Visit our website &rarr;</a>
        </td>
      </tr></table>
      <p style="margin:14px 0 0 0;font-family:{FONT};font-size:13px;line-height:1.5;color:{MUTED};">
        Questions? Just reply to this email and we&rsquo;ll get back to you.
      </p>
    </td></tr>"""


def _paragraph(block: str) -> str:
    return (
        f'<p style="margin:0 0 16px 0;font-family:{FONT};font-size:15px;line-height:1.7;color:{BODY};">'
        f'{escape(block).replace(chr(10), "<br>")}</p>'
    )


def _signature(block: str) -> str:
    """"Regards," then the sender's name: a quiet block with a cyan accent line."""
    first, _, rest = block.partition("\n")
    name = escape(rest.strip()).replace(chr(10), "<br>")
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px 0;"><tr>'
        f'<td width="3" bgcolor="{CYAN}" style="width:3px;background-color:{CYAN};border-radius:3px;">&nbsp;</td>'
        f'<td style="padding:2px 0 2px 14px;font-family:{FONT};">'
        f'<div style="font-size:14px;line-height:1.5;color:{MUTED};">{escape(first.strip())}</div>'
        f'<div style="font-size:15px;line-height:1.5;font-weight:600;color:{INK};">{name}</div>'
        f"</td></tr></table>"
    )


def _paragraphs(text: str) -> str:
    """Plain text to HTML: blank lines split paragraphs, single newlines become <br>. A closing
    "Regards, <name>" paragraph becomes a signature block."""
    blocks = [b.strip("\n") for b in text.replace("\r\n", "\n").split("\n\n") if b.strip()]
    out = []
    for block in blocks:
        head = block.split("\n", 1)[0].strip().rstrip(",!.").lower()
        if "\n" in block and head in _SIGN_OFFS:
            out.append(_signature(block))
        else:
            out.append(_paragraph(block))
    return "".join(out)


def _code_box(code: str) -> str:
    """A one-time code, large and spaced, for the sign-in / password reset emails."""
    return (
        f'<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" '
        f'style="margin:6px auto 24px auto;"><tr><td align="center" bgcolor="#F0F9FF" '
        f'style="padding:16px 36px;background-color:#F0F9FF;border:2px dashed {CYAN};border-radius:12px;'
        f"font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;"
        f'letter-spacing:10px;color:{NAVY};">{escape(code)}</td></tr></table>'
    )


def render_html(
    subject: str, text: str, *, code: str | None = None, text_after: str = ""
) -> str:
    """`code` shows a one-time code box between `text` and `text_after`, with no website button."""
    body = _paragraphs(text)
    if code:
        body += _code_box(code) + _paragraphs(text_after)
    button = "" if code else _BUTTON
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:{PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{escape(text[:110])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{PAGE};">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
         style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:14px;overflow:hidden;
                box-shadow:0 4px 18px rgba(11,31,58,0.10);">
    <tr><td height="8" style="height:8px;line-height:8px;font-size:8px;background-color:{CYAN};
            background-image:linear-gradient(90deg,{CYAN},{BLUE});">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#FFFFFF" style="padding:26px 24px 20px 24px;background-color:#FFFFFF;">
      <a href="{SITE}" style="text-decoration:none;">
        <img src="cid:{LOGO_CID}" width="150" alt="ARQUS Sports Consultancy"
             style="display:block;width:150px;max-width:100%;height:auto;border:0;outline:none;">
      </a>
    </td></tr>
    <tr><td bgcolor="#F0F9FF" style="padding:22px 40px;background-color:#F0F9FF;border-top:1px solid #E0F2FE;border-bottom:1px solid #E0F2FE;">
      <div style="font-family:{FONT};font-size:11px;font-weight:600;letter-spacing:1.6px;color:{BLUE};text-transform:uppercase;">ARQUS Sports Consultancy</div>
      <h1 style="margin:6px 0 0 0;font-family:{FONT};font-size:20px;line-height:1.35;font-weight:600;color:{NAVY};">{escape(subject)}</h1>
    </td></tr>
    <tr><td style="padding:28px 40px 10px 40px;font-family:{FONT};">
      {body}
    </td></tr>
    {button}
    <tr><td style="padding:22px 0 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="{NAVY}" style="padding:26px 24px;background-color:{NAVY};font-family:{FONT};">
      <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#FFFFFF;">ARQUS Sports Consultancy</p>
      <p style="margin:0 0 14px 0;font-size:12px;letter-spacing:0.4px;color:{GOLD};">Idealize. Innovate. Achieve.</p>
      <p style="margin:0 0 14px 0;font-size:12px;color:{MUTED};">Pune, India</p>
      <p style="margin:0;font-size:12px;">
        <a href="{SITE}" style="color:{CYAN};text-decoration:none;">Website</a>
        <span style="color:#475569;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
        <a href="{FACEBOOK}" style="color:{CYAN};text-decoration:none;">Facebook</a>
        <span style="color:#475569;">&nbsp;&nbsp;&middot;&nbsp;&nbsp;</span>
        <a href="{INSTAGRAM}" style="color:{CYAN};text-decoration:none;">Instagram</a>
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
    *,
    code: str | None = None,
    text_after: str = "",
    plain_text: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,
) -> EmailMultiAlternatives:
    """The plain text plus the branded HTML (with the embedded logo) as one message."""
    message = EmailMultiAlternatives(
        subject=subject,
        body=plain_text or text,
        from_email=from_email,
        to=[to],
        reply_to=[reply_to] if reply_to else None,
        headers=headers,
        connection=connection,
    )
    message.attach_alternative(render_html(subject, text, code=code, text_after=text_after), "text/html")
    message.mixed_subtype = "related"  # the logo belongs to the HTML part
    if LOGO_PATH.exists():
        logo = MIMEImage(LOGO_PATH.read_bytes(), _subtype="png")
        logo.add_header("Content-ID", f"<{LOGO_CID}>")
        logo.add_header("Content-Disposition", "inline", filename="arqus-logo.png")
        message.attach(logo)
    for name, content, mimetype in attachments or []:
        message.attach(name, content, mimetype)
    return message
