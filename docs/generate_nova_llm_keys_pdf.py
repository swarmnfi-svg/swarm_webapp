"""Generate Nova Space OP LLM API Keys setup guide PDF."""
from datetime import date
from fpdf import FPDF

OUTPUT = "docs/NOVA_LLM_API_Keys_Setup_Guide.pdf"


class GuidePDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "SWARM Nova Space OP - LLM API Keys Setup Guide", align="L")
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def section_title(self, title):
        self.ln(3)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(0, 80, 140)
        self.multi_cell(0, 8, title)
        self.ln(2)
        self.set_draw_color(0, 120, 200)
        self.set_line_width(0.4)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def sub_title(self, title):
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, title)
        self.ln(1)

    def body(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5, text)
        self.ln(2)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        x = self.get_x()
        self.cell(6, 5, "-")
        self.multi_cell(0, 5, text)
        self.set_x(x)

    def numbered(self, n, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.cell(8, 5, f"{n}.")
        self.multi_cell(0, 5, text)
        self.ln(1)

    def note(self, text):
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 5, f"Note: {text}")
        self.ln(2)

    def code(self, text):
        self.set_font("Courier", "", 9)
        self.set_fill_color(245, 245, 245)
        self.multi_cell(0, 5, text, fill=True)
        self.ln(2)


def build_pdf():
    pdf = GuidePDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(0, 60, 110)
    pdf.multi_cell(0, 10, "Nova Space OP\nLLM API Keys Setup Guide")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, 6, f"SWARM by nanoFarm | {date.today().strftime('%B %d, %Y')}")
    pdf.ln(4)
    pdf.body(
        "This guide explains how to create 5 API keys for Nova Space OP in SWARM: "
        "2 Groq keys, 2 OpenRouter keys, and 1 Google Gemini key. "
        "Keep keys private. Do not commit them to Git or share them in chat screenshots."
    )

    pdf.section_title("1. Overview")
    pdf.body("You will create the following keys and label them clearly:")
    pdf.bullet("GROQ_API_KEY (primary Groq)")
    pdf.bullet("GROQ_API_KEY_2 (Groq failover / second key)")
    pdf.bullet("OPENROUTER_API_KEY (primary OpenRouter)")
    pdf.bullet("OPENROUTER_API_KEY_2 (OpenRouter failover / second key)")
    pdf.bullet("GEMINI_API_KEY (Google Gemini)")
    pdf.ln(2)
    pdf.body(
        "Recommended use in SWARM Nova Space OP (when LLM is enabled): "
        "Groq for fast Think/Narrate, OpenRouter as backup router, Gemini as additional failover."
    )

    pdf.section_title("2. Groq - Create 2 API Keys")
    pdf.sub_title("2.1 Sign up / log in")
    pdf.numbered(1, "Open https://console.groq.com in your browser.")
    pdf.numbered(2, "Sign up with email or Google, or log in if you already have an account.")
    pdf.numbered(3, "Complete email verification if prompted.")

    pdf.sub_title("2.2 Create primary key (GROQ_API_KEY)")
    pdf.numbered(1, "In the left menu, open API Keys (or visit https://console.groq.com/keys).")
    pdf.numbered(2, "Click Create API Key.")
    pdf.numbered(3, "Name it: SWARM-Nova-Primary")
    pdf.numbered(4, "Copy the key immediately (starts with gsk_). Store it in a password manager.")
    pdf.numbered(5, "Label this key as GROQ_API_KEY for SWARM.")

    pdf.sub_title("2.3 Create second key (GROQ_API_KEY_2)")
    pdf.numbered(1, "Click Create API Key again.")
    pdf.numbered(2, "Name it: SWARM-Nova-Failover")
    pdf.numbered(3, "Copy and save as GROQ_API_KEY_2.")
    pdf.note(
        "A second key helps when the first hits rate limits. Use a different Groq account "
        "or organization if your plan allows only one key per quota bucket."
    )

    pdf.sub_title("2.4 Suggested Groq models for Nova")
    pdf.bullet("Text / chat: llama-3.3-70b-versatile")
    pdf.bullet("Fast fallback: llama-3.1-8b-instant")
    pdf.bullet("Vision (future): meta-llama/llama-4-scout-17b-16e-instruct")

    pdf.section_title("3. OpenRouter - Create 2 API Keys")
    pdf.sub_title("3.1 Sign up / log in")
    pdf.numbered(1, "Open https://openrouter.ai")
    pdf.numbered(2, "Click Sign In and use Google, GitHub, or email.")
    pdf.numbered(3, "Open Settings or Keys: https://openrouter.ai/keys")

    pdf.sub_title("3.2 Add credits (recommended)")
    pdf.numbered(1, "Go to Credits / Billing in OpenRouter.")
    pdf.numbered(2, "Add a small balance for production testing (pay-as-you-go).")
    pdf.note("Some free models exist, but paid credits improve reliability for Nova failover.")

    pdf.sub_title("3.3 Create primary key (OPENROUTER_API_KEY)")
    pdf.numbered(1, "Click Create Key.")
    pdf.numbered(2, "Name: SWARM-Nova-Primary")
    pdf.numbered(3, "Set optional spending limit if available.")
    pdf.numbered(4, "Copy the key (starts with sk-or-). Save as OPENROUTER_API_KEY.")

    pdf.sub_title("3.4 Create second key (OPENROUTER_API_KEY_2)")
    pdf.numbered(1, "Create another key named SWARM-Nova-Failover.")
    pdf.numbered(2, "Copy and save as OPENROUTER_API_KEY_2.")

    pdf.sub_title("3.5 Suggested OpenRouter models for Nova")
    pdf.bullet("General: meta-llama/llama-3.3-70b-instruct")
    pdf.bullet("Economy: google/gemma-2-9b-it")
    pdf.bullet("Base URL for OpenAI-compatible clients: https://openrouter.ai/api/v1")

    pdf.add_page()
    pdf.section_title("4. Google Gemini - Create 1 API Key")
    pdf.sub_title("4.1 Google AI Studio")
    pdf.numbered(1, "Open https://aistudio.google.com/apikey")
    pdf.numbered(2, "Sign in with your Google account.")
    pdf.numbered(3, "Accept terms if prompted.")

    pdf.sub_title("4.2 Create API key (GEMINI_API_KEY)")
    pdf.numbered(1, "Click Create API key.")
    pdf.numbered(2, "Choose an existing Google Cloud project or create a new one.")
    pdf.numbered(3, "Copy the key immediately. Save as GEMINI_API_KEY.")
    pdf.numbered(4, "Restrict the key in Google Cloud Console (API restrictions: Generative Language API only).")

    pdf.sub_title("4.3 Suggested Gemini models for Nova")
    pdf.bullet("Fast: gemini-2.0-flash")
    pdf.bullet("Higher quality: gemini-1.5-pro")
    pdf.bullet("Gemini uses Google AI API, not OpenAI-compatible URL by default.")

    pdf.section_title("5. Where Keys Go in SWARM (for your engineer)")
    pdf.body("When you share keys, they will be set as environment variables - never in source code.")
    pdf.ln(1)
    pdf.sub_title("Local development (PowerShell)")
    pdf.code(
        "$env:GROQ_API_KEY='gsk_...'\n"
        "$env:GROQ_API_KEY_2='gsk_...'\n"
        "$env:OPENROUTER_API_KEY='sk-or-...'\n"
        "$env:OPENROUTER_API_KEY_2='sk-or-...'\n"
        "$env:GEMINI_API_KEY='AIza...'"
    )

    pdf.sub_title("Railway / production")
    pdf.body("Add the same variable names in Railway project Settings > Variables for the backend service.")
    pdf.bullet("GROQ_API_KEY")
    pdf.bullet("GROQ_API_KEY_2")
    pdf.bullet("OPENROUTER_API_KEY")
    pdf.bullet("OPENROUTER_API_KEY_2")
    pdf.bullet("GEMINI_API_KEY")
    pdf.bullet("NOVA_LLM_BASE_URL (e.g. https://api.groq.com/openai/v1 for Groq primary)")
    pdf.bullet("NOVA_LLM_MODEL (e.g. llama-3.3-70b-versatile)")

    pdf.section_title("6. Security checklist")
    pdf.bullet("Never commit .env files or paste keys into GitHub.")
    pdf.bullet("Rotate keys if exposed.")
    pdf.bullet("Use separate keys for dev vs production.")
    pdf.bullet("Set spending limits on OpenRouter and monitor Groq usage dashboards.")
    pdf.bullet("Restrict Gemini keys to Generative Language API only.")

    pdf.section_title("7. What to send later")
    pdf.body("When ready, provide your engineer these 5 values securely (password manager share, not public chat):")
    pdf.numbered(1, "GROQ_API_KEY")
    pdf.numbered(2, "GROQ_API_KEY_2")
    pdf.numbered(3, "OPENROUTER_API_KEY")
    pdf.numbered(4, "OPENROUTER_API_KEY_2")
    pdf.numbered(5, "GEMINI_API_KEY")
    pdf.note(
        "After keys are received, SWARM will wire them into Nova Think/Narrate with provider failover. "
        "Until then, Nova Space OP continues to work with deterministic (non-LLM) answers."
    )

    pdf.output(OUTPUT)
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
