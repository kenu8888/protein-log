import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabaseUrl = 'https://sqcbecfmliunmzghscjc.supabase.co'
const supabaseKey = 'sb_publishable_ST-XTo2ruNof15C9lK3lkg_7-WLRwuT'

const supabase = createClient(supabaseUrl, supabaseKey)

async function loadBrands() {

 const { data, error } = await supabase
   .from('brands')
   .select('*')

 const list = document.getElementById("brands")

 list.innerHTML = ""

 data.forEach(b => {
   const li = document.createElement("li")
   li.textContent = b.name + " (" + b.country + ")"
   list.appendChild(li)
 })

}

loadBrands()