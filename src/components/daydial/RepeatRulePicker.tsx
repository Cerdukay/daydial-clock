import { REPEAT_OPTIONS, type RepeatRule } from "@/lib/daydial/types";
import { NativeSelect } from "@/components/ui/native-select";
import { useI18n } from "@/lib/i18n";

export function RepeatRulePicker({
  value,
  onChange,
}: {
  value: RepeatRule;
  onChange: (rule: RepeatRule) => void;
}) {
  const { t } = useI18n();
  return (
    <NativeSelect
      value={value}
      onValueChange={(next) => onChange(next as RepeatRule)}
      aria-label={t("editor.repeat")}
      options={REPEAT_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`repeat.${option.value}` as const),
      }))}
    />
  );
}
