"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function recordUsage(formData: FormData) {
  const stockItemId = String(formData.get("stock_item_id") ?? "")
  const quantity = Number(formData.get("quantity") ?? 0)
  const jobNumber = String(formData.get("job_number") ?? "").trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")
  if (!stockItemId || quantity <= 0 || !jobNumber) {
    redirect(
      `/dashboard/stock/${stockItemId}?error=${encodeURIComponent(
        "Quantity and job number are required."
      )}`
    )
  }

  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItemId,
    movement_type: "used",
    quantity: -Math.abs(quantity),
    job_number: jobNumber,
    performed_by: user.id,
  })

  if (error) {
    redirect(`/dashboard/stock/${stockItemId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/dashboard/stock/${stockItemId}`)
}

export async function recordAdjustment(formData: FormData) {
  const stockItemId = String(formData.get("stock_item_id") ?? "")
  const quantity = Number(formData.get("quantity") ?? 0)
  const notes = String(formData.get("notes") ?? "").trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")
  if (!stockItemId || quantity === 0) {
    redirect(
      `/dashboard/stock/${stockItemId}?error=${encodeURIComponent(
        "Enter a non-zero adjustment quantity."
      )}`
    )
  }

  const { error } = await supabase.from("stock_movements").insert({
    stock_item_id: stockItemId,
    movement_type: "adjustment",
    quantity,
    performed_by: user.id,
    notes: notes || null,
  })

  if (error) {
    redirect(`/dashboard/stock/${stockItemId}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/dashboard/stock/${stockItemId}`)
}
