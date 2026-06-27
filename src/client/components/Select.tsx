import * as RS from "@radix-ui/react-select";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

/** Styled dropdown built on Radix Select so it matches the design (the native
 *  <select> popup can't be themed). Keyboard + screen-reader accessible. */
export function Select({ value, onValueChange, options, id, invalid, disabled, placeholder, ariaLabel }: SelectProps) {
  return (
    <RS.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RS.Trigger
        id={id}
        aria-label={ariaLabel}
        className={`select-trigger ${invalid ? "select-trigger--invalid" : ""}`.trim()}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon className="select-trigger__icon" aria-hidden="true">
          ▾
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content className="select-content" position="popper" sideOffset={6}>
          <RS.Viewport className="select-viewport">
            {options.map((o) => (
              <RS.Item key={o.value} value={o.value} className="select-item">
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="select-item__check" aria-hidden="true">
                  ✓
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
