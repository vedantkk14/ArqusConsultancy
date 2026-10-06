from apps.core.email_html import render_html


def test_a_regards_paragraph_becomes_a_signature_block_and_text_is_escaped():
    html = render_html(
        "Following up, <Asha>",
        "Hi Asha,\n\nJust checking in <b>today</b>.\n\nRegards,\nVedant K",
    )
    assert "Regards," in html and "Vedant K" in html and "border-radius:3px" in html
    assert "&lt;b&gt;today&lt;/b&gt;" in html and "<b>today</b>" not in html
    assert "Following up, &lt;Asha&gt;" in html
    assert "cid:arqus-logo" in html and "Visit our website" in html
    assert "reply to this email" in html


def test_headings_use_one_sans_serif_family_and_a_moderate_size():
    html = render_html("Hello", "Hi there")
    assert "Georgia" not in html and "serif" not in html.replace("sans-serif", "")
    assert "font-size:20px" in html and "font-weight:600" in html


def test_code_emails_have_the_code_box_and_no_website_button():
    html = render_html("Code", "Hi,", code="123456", text_after="Expires soon.")
    assert "123456" in html and "Expires soon." in html
    assert "Visit our website" not in html
