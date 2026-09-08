import { CATEGORIES, type Category } from "@/lib/daydial/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category;
  onChange: (category: Category) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("editor.category")}
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {CATEGORIES.map((category) => {
        const active = category === value;
        return (
          <button
            key={category}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(category)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium",
              active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
            )}
          >
            {t(`category.${category}` as const)}
          </button>
        );
      })}
    </div>
  );
}
