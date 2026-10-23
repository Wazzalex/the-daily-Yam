import type { Metadata } from "next";
import { loadConfig } from "@/lib/config";
import { NavPills } from "@/components/NavPills";
import { VoicePicker } from "@/components/VoicePicker";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Choose your voice" };

export default function VoicesPage() {
  const config = loadConfig();
  return (
    <div className="wrap">
      <NavPills categories={config.categories} active="voices" />
      <div className="sec-head">
        <h2>Choose your voice</h2>
        <span className="sec-head__meta">{config.audio.voices.length} to try</span>
      </div>
      <p style={{ margin: "0 0 6px", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.5 }}>
        Each voice reads the same short paragraph in a British accent. Tap play to compare, then "Use this voice": every recap and the morning briefing will use it on this phone from now on.
      </p>
      {config.audio.provider === "openai" ? (
        <VoicePicker voices={config.audio.voices} defaultVoice={config.audio.voice} />
      ) : (
        <p className="empty">The premium voice is switched off; recaps use your phone's own voice.</p>
      )}
    </div>
  );
}
