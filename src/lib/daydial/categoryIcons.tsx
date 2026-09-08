import {
  Briefcase,
  Dumbbell,
  Focus,
  ShoppingBag,
  Users,
  User,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/daydial/types";

/** Clean line icon per category, used in the Upcoming / Agenda cards. */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  Personal: User,
  Work: Briefcase,
  Health: Dumbbell,
  Social: Users,
  Errands: ShoppingBag,
  Focus: Focus,
};

export function categoryIcon(category: Category): LucideIcon {
  return CATEGORY_ICONS[category] ?? User;
}
