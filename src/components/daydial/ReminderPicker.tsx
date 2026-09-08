import { REMINDER_OPTIONS } from "@/lib/daydial/types";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n";

export function ReminderPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const { t } = useI18n();
  return (
    <NativeSelect
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
      aria-label={t("editor.reminder")}
      options={REMINDER_OPTIONS.map((option) => ({
        value: String(option.value),
        label: t(`reminder.${option.value}` as const),
      }))}
    />
  );
}
