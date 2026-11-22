resource "cloudflare_d1_database" "bm" {
  account_id = var.account_id
  name       = var.worker_name
}

resource "cloudflare_workers_script" "bm" {
  account_id         = var.account_id
  script_name        = var.worker_name
  content            = file("${path.module}/../worker/src/index.js")
  main_module        = "index.js"
  compatibility_date = "2026-01-01"

  bindings = [{
    type = "d1"
    name = "DB"
    id   = cloudflare_d1_database.bm.id
  }]
}

# Serve the Worker at https://<worker_name>.<workers_subdomain>.workers.dev
resource "cloudflare_workers_script_subdomain" "bm" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.bm.script_name
  enabled     = true
}
