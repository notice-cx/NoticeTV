import { Check } from 'lucide-react';
import { themes, themeIds, type ThemeId } from '../shared/themes';
import { themeStyle } from './theme';

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}) {
  return (
    <fieldset className="theme-picker">
      <legend>Theme</legend>
      <div className="theme-options">
        {themeIds.map((id) => (
          <label key={id} className={`theme-choice ${value === id ? 'selected' : ''}`}>
            <input
              type="radio"
              name="dashboard-theme"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <span className="theme-swatch" style={themeStyle(id)} aria-hidden="true">
              <i />
              <span />
              <span />
              <b />
            </span>
            <span className="theme-choice-label">
              {themes[id].name}
              {value === id && <Check size={11} aria-hidden="true" />}
            </span>
          </label>
        ))}
      </div>
      <p className="field-hint">{themes[value].description}</p>
    </fieldset>
  );
}
