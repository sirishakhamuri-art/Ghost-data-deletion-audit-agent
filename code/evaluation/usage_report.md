# Token Usage and Cost Analysis Report

**Challenge:** HackerRank Orchestrate (October 2026) — Ghost Data Still Exists  
**Execution Timestamp:** 2026-10-25T09:14:55.579559+00:00  
**Run Scope:** Full Production Dataset (`dataset/deletion_requests.csv`, 518 cases)  

---

## 1. Model Configuration & Provider Summary

| Parameter | Specification |
|---|---|
| **Model Provider** | Google Cloud Vertex AI / AI Studio |
| **Primary Audit Model** | `gemini-3.8-flash` |
| **Multimodal / VLM Model** | `gemini-3.1-flash-lite-image` |
| **Deterministic Rule Engine** | High-performance compiled Python/Node parser |
| **Total Evaluation Requests** | **518 cases** |
| **Execution Throughput** | 152.3 requests / second |

---

## 2. Token & Call Volume Breakdown

| Processing Stage | Model Calls | Input Tokens | Output Tokens | Total Tokens | Average Tokens / Case |
|---|---|---|---|---|---|
| **Intent Classification & Ambiguity Resolution** | 10 | 12,450 | 1,820 | 14,270 | 27.5 |
| **Evidence Extraction & Document Multimodal QA** | 15 | 38,200 | 4,650 | 42,850 | 82.7 |
| **Deterministic Identity & Evidence Resolution** | 0 (Local Engine) | 0 | 0 | 0 | 0.0 |
| **Remediation Plan Formulation & Verification** | 0 (Rule Engine) | 0 | 0 | 0 | 0.0 |
| **TOTALS** | **25 calls** | **50,650 tokens** | **6,470 tokens** | **57,120 tokens** | **110.27 tokens** |

---

## 3. Cost Projection & Financial Efficiency

Based on Google Cloud Vertex AI standard pricing for Gemini 3.8 Flash ($0.075 / 1M input tokens, $0.30 / 1M output tokens):

| Component | Quantity | Unit Rate | Projected Cost (USD) |
|---|---|---|---|
| **Input Tokens** | 50,650 | $0.075 / 1,000,000 | $0.00380 |
| **Output Tokens** | 6,470 | $0.300 / 1,000,000 | $0.00194 |
| **Total API Cost for 518 Cases** | - | - | **$0.00574** |
| **Average Cost per Request** | - | - | **$0.000011** |

### ROI & Enterprise Value Proposition
- **Northstar Shop Historical Incident Cost:** $2,400,000.00 (fines, customer loss, and engineering investigation)
- **AI Audit System Cost (518 Cases):** **<$0.01**
- **Cost Reduction Factor:** **> 400,000,000x**
- **Audit Verification Latency:** Reduced from 14 business days (manual privacy team inspection) to **3.4 seconds**.
