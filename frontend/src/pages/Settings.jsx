import { useState } from "react";
import { Button } from "../components/ui/Button";

function InputRow({ label, children }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <label className="text-sm font-medium" style={{ color: "#F1F5F9" }}>{label}</label>
      {children}
    </div>
  );
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div className="flex gap-3">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: value === o ? "#F1F5F9" : "#8B9CC3" }}>
          <input type="radio" checked={value === o} onChange={() => onChange(o)} className="accent-green-500" />
          {o}
        </label>
      ))}
    </div>
  );
}

function DisplayPrefs() {
  const [tempUnit, setTempUnit] = useState("°C");
  const [yieldUnit, setYieldUnit] = useState("kg/ha");
  const [defaultRange, setDefaultRange] = useState("24H");

  return (
    <div className="card max-w-2xl space-y-1">
      <InputRow label="Theme">
        <RadioGroup options={["Dark", "Light"]} value="Dark" onChange={() => {}} />
      </InputRow>
      <InputRow label="Temperature Unit">
        <RadioGroup options={["°C", "°F"]} value={tempUnit} onChange={setTempUnit} />
      </InputRow>
      <InputRow label="Yield Unit">
        <RadioGroup options={["kg/ha", "lbs/acre"]} value={yieldUnit} onChange={setYieldUnit} />
      </InputRow>
      <InputRow label="Default Chart Range">
        <RadioGroup options={["1H", "6H", "24H", "7D"]} value={defaultRange} onChange={setDefaultRange} />
      </InputRow>
      <div className="mt-4 pt-3"><Button size="sm">Save</Button></div>
    </div>
  );
}

export default function Settings() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: "#F1F5F9" }}>Settings</h1>
      <DisplayPrefs />
    </div>
  );
}
