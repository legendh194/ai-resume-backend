// redeploy v3
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DAILY_LIMIT = 1400

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { name, experience, skills } = await req.json()
    const authHeader = req.headers.get("Authorization")!
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader }
    )

    const { data: usage } = await supabase.from("usage").select("count, last_reset").single()
    if (usage.count >= DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: "Daily limit reached" }), {
        status: 429, headers: {...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY")!
    let resumeText = ""
    try {
      resumeText = await callGemini(name, experience, skills, geminiKey)
    } catch (e) {
      const openRouterKey = Deno.env.get("OPENROUTER_API_KEY")!
      resumeText = await callOpenRouter(name, experience, skills, openRouterKey)
    }

    await supabase.from("usage").update({ count: usage.count + 1 }).eq("id", usage.id)
    return new Response(JSON.stringify({ resume: resumeText }), {
      headers: {...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: {...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

async function callGemini(name: string, experience: string, skills: string, key: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Write a professional resume for ${name}. Experience: ${experience}. Skills: ${skills}.` }] })
  })
  if (!res.ok) throw new Error("Gemini failed")
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

async function callOpenRouter(name: string, experience: string, skills: string, key: string) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "user", content: `Write a professional resume for ${name}. Experience: ${experience}. Skills: ${skills}.` }] })
  })
  if (!res.ok) throw new Error("OpenRouter failed")
  const data = await res.json()
  return data.choices[0].message.content
                          } 
