import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";
import { CustomCategory } from "./useCustomCategories";

export interface SubCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface ParentCategory {
  id: string;
  label: string;
  color: string;
  emoji: string;
  subcategories: SubCategory[];
}

export const EXPENSE_CATEGORIES: ParentCategory[] = [
  {
    id: "food-drinks",
    label: "Food & Drinks",
    color: "hsl(25, 85%, 55%)",
    emoji: "🍽️",
    subcategories: [
      { id: "groceries",      label: "Groceries",             emoji: "🛒" },
      { id: "dining-out",     label: "Dining Out",            emoji: "🍜" },
      { id: "street-food",    label: "Street Food / Snacks",  emoji: "🌮" },
      { id: "coffee-tea",     label: "Coffee / Tea",          emoji: "☕" },
      { id: "meal-delivery",  label: "Meal Delivery",         emoji: "🛵" },
      { id: "drinks",         label: "Drinks",                emoji: "🥤" },
    ],
  },
  {
    id: "transport",
    label: "Transport",
    color: "hsl(210, 75%, 50%)",
    emoji: "🚗",
    subcategories: [
      { id: "rickshaw-cng",   label: "Rickshaw / CNG",        emoji: "🛺" },
      { id: "ride-share",     label: "Ride-share",            emoji: "🚖" },
      { id: "public-transit", label: "Bus / Public Transport", emoji: "🚌" },
      { id: "fuel",           label: "Fuel / Petrol",         emoji: "⛽" },
      { id: "vehicle-maint",  label: "Vehicle Maintenance",   emoji: "🔧" },
      { id: "parking",        label: "Parking",               emoji: "🅿️" },
    ],
  },
  {
    id: "housing",
    label: "Housing",
    color: "hsl(160, 60%, 40%)",
    emoji: "🏠",
    subcategories: [
      { id: "rent",           label: "Rent",                  emoji: "🏘️" },
      { id: "electricity",    label: "Electricity / Gas / Water", emoji: "⚡" },
      { id: "internet",       label: "Internet / WiFi",       emoji: "📶" },
      { id: "home-maint",     label: "Home Maintenance",      emoji: "🪛" },
      { id: "household-sup",  label: "Household Supplies",    emoji: "🧹" },
    ],
  },
  {
    id: "health",
    label: "Health",
    color: "hsl(340, 70%, 55%)",
    emoji: "💊",
    subcategories: [
      { id: "doctor",         label: "Doctor / Consultation", emoji: "🩺" },
      { id: "medicine",       label: "Medicine / Pharmacy",   emoji: "💊" },
      { id: "lab-tests",      label: "Lab Tests",             emoji: "🧪" },
      { id: "gym",            label: "Gym / Fitness",         emoji: "🏋️" },
      { id: "mental-health",  label: "Mental Health",         emoji: "🧠" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    color: "hsl(280, 65%, 55%)",
    emoji: "🛍️",
    subcategories: [
      { id: "clothing",       label: "Clothing / Apparel",    emoji: "👕" },
      { id: "gadgets",        label: "Electronics / Gadgets", emoji: "💻" },
      { id: "personal-care",  label: "Personal Care / Grooming", emoji: "🪥" },
      { id: "books-stat",     label: "Books / Stationery",    emoji: "📖" },
      { id: "household-item", label: "Household Items",       emoji: "🪴" },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    color: "hsl(45, 90%, 50%)",
    emoji: "🎮",
    subcategories: [
      { id: "streaming",      label: "Streaming Services",    emoji: "📺" },
      { id: "subscriptions",  label: "Subscriptions",         emoji: "🔔" },
      { id: "games",          label: "Games",                 emoji: "🕹️" },
      { id: "events",         label: "Events / Outings",      emoji: "🎟️" },
      { id: "hobbies",        label: "Hobbies",               emoji: "🎨" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    color: "hsl(140, 60%, 40%)",
    emoji: "💰",
    subcategories: [
      { id: "savings",        label: "Savings / Investment",  emoji: "🏦" },
      { id: "loan-repay",     label: "Loan Repayment",        emoji: "💳" },
      { id: "insurance",      label: "Insurance",             emoji: "🛡️" },
      { id: "tax-fees",       label: "Tax / Govt Fees",       emoji: "🏛️" },
    ],
  },
  {
    id: "education",
    label: "Education",
    color: "hsl(195, 70%, 45%)",
    emoji: "📚",
    subcategories: [
      { id: "tuition",        label: "Tuition / Courses",     emoji: "🎓" },
      { id: "edu-books",      label: "Books / Materials",     emoji: "📕" },
      { id: "exam-fees",      label: "Exam Fees",             emoji: "📝" },
    ],
  },
  {
    id: "social",
    label: "Social",
    color: "hsl(15, 80%, 55%)",
    emoji: "🤝",
    subcategories: [
      { id: "gifts",          label: "Gifts",                 emoji: "🎁" },
      { id: "charity",        label: "Charity / Donations",   emoji: "❤️" },
      { id: "social-outing",  label: "Social Outings",        emoji: "🥂" },
    ],
  },
  {
    id: "business",
    label: "Business",
    color: "hsl(220, 60%, 50%)",
    emoji: "💼",
    subcategories: [
      { id: "raw-materials",  label: "Raw Materials",         emoji: "📦" },
      { id: "delivery",       label: "Delivery / Shipping",   emoji: "🚚" },
      { id: "marketing",      label: "Marketing",             emoji: "📣" },
      { id: "tools-software", label: "Tools / Software",      emoji: "🖥️" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    color: "hsl(185, 65%, 45%)",
    emoji: "📱",
    subcategories: [
      { id: "mobile-data",    label: "Mobile Recharge / Data", emoji: "📱" },
      { id: "broadband",      label: "Broadband",             emoji: "🌐" },
    ],
  },
  {
    id: "personal-habits",
    label: "Personal Habits",
    color: "hsl(0, 60%, 50%)",
    emoji: "🚬",
    subcategories: [
      { id: "smoking",        label: "Smoking",               emoji: "🚬" },
      { id: "alcohol",        label: "Alcohol / Drinking",    emoji: "🍺" },
      { id: "weed",           label: "Weed",                  emoji: "🌿" },
      { id: "other-drugs",    label: "Other Substances",      emoji: "💉" },
      { id: "gambling",       label: "Gambling / Betting",    emoji: "🎰" },
      { id: "other-habits",   label: "Other Habits",          emoji: "🔄" },
    ],
  },
  {
    id: "other",
    label: "Other",
    color: "hsl(220, 15%, 55%)",
    emoji: "❓",
    subcategories: [
      { id: "uncategorized",  label: "Uncategorized",         emoji: "❔" },
    ],
  },
];

export function parseCategoryValue(compound: string): {
  parentId: string;
  subId?: string;
} {
  const [parentId, subId] = compound.split(":");
  return { parentId, subId };
}

export function buildCategoryValue(parentId: string, subId?: string): string {
  return subId ? `${parentId}:${subId}` : parentId;
}

export function getParentCategory(parentId: string): ParentCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === parentId);
}

export function getCategoryColor(compound: string, customCategories?: CustomCategory[]): string {
  const { parentId } = parseCategoryValue(compound);
  const builtIn = getParentCategory(parentId)?.color;
  if (builtIn) return builtIn;
  if (customCategories) {
    const custom = customCategories.find((c) => c.name === compound);
    if (custom) return custom.color;
  }
  return "#64748b";
}

export function getParentLabel(compound: string): string {
  const { parentId } = parseCategoryValue(compound);
  return getParentCategory(parentId)?.label ?? compound;
}

export function getSubCategoryLabel(compound: string): string | undefined {
  const { parentId, subId } = parseCategoryValue(compound);
  if (!subId) return undefined;
  const parent = getParentCategory(parentId);
  return parent?.subcategories.find((s) => s.id === subId)?.label;
}

export function getSubCategoryEmoji(compound: string): string | undefined {
  const { parentId, subId } = parseCategoryValue(compound);
  const parent = getParentCategory(parentId);
  if (!parent) return undefined;
  if (subId) return parent.subcategories.find((s) => s.id === subId)?.emoji;
  return parent.emoji;
}

export function getCategoryDisplayLabel(compound: string): string {
  const parentLabel = getParentLabel(compound);
  const subLabel = getSubCategoryLabel(compound);
  return subLabel ? `${parentLabel} · ${subLabel}` : parentLabel;
}

export function isValidCategory(compound: string): boolean {
  const { parentId, subId } = parseCategoryValue(compound);
  const parent = getParentCategory(parentId);
  if (!parent) return false;
  if (!subId) return true;
  return parent.subcategories.some((s) => s.id === subId);
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  user_id: string;
  created_at: string;
}

export interface Budget {
  id: string;
  amount: number;
  category: string;
  month: string;
  user_id: string;
  created_at: string;
}

export function useExpenses(month: Date) {
  const { user } = useAuth();
  const start = format(startOfMonth(month), "yyyy-MM-dd");
  const end = format(endOfMonth(month), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["expenses", user?.id, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!user,
  });
}

export function usePrevMonthExpenses(month: Date) {
  const { user } = useAuth();
  const prev = subMonths(month, 1);
  const start = format(startOfMonth(prev), "yyyy-MM-dd");
  const end = format(endOfMonth(prev), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["expenses", user?.id, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!user,
  });
}

export function useBudgets(month: Date) {
  const { user } = useAuth();
  const monthStr = format(startOfMonth(month), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["budgets", user?.id, monthStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("month", monthStr);
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!user,
  });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (expense: { amount: number; category: string; date: string; note?: string }) => {
      const { error } = await supabase.from("expenses").insert({
        ...expense,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expense: { id: string; amount: number; category: string; date: string; note: string | null }) => {
      const { error } = await supabase
        .from("expenses")
        .update({
          amount: expense.amount,
          category: expense.category,
          date: expense.date,
          note: expense.note,
        })
        .eq("id", expense.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useUpsertBudget() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (budget: { amount: number; category: string; month: Date }) => {
      const monthStr = format(startOfMonth(budget.month), "yyyy-MM-dd");

      // Check if budget exists
      const { data: existing } = await supabase
        .from("budgets")
        .select("id")
        .eq("month", monthStr)
        .eq("category", budget.category)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("budgets")
          .update({ amount: budget.amount })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert({
          amount: budget.amount,
          category: budget.category,
          month: monthStr,
          user_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}
