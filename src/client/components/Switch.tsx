import * as RSwitch from "@radix-ui/react-switch";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Themed on/off toggle built on Radix Switch (native checkboxes can't be themed). */
export function Switch({ checked, onCheckedChange, id, disabled, ariaLabel }: SwitchProps) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="switch"
    >
      <RSwitch.Thumb className="switch__thumb" />
    </RSwitch.Root>
  );
}
