output "url" {
  value = "https://${var.worker_name}.${var.workers_subdomain}.workers.dev"
}

output "d1_database_id" {
  value = cloudflare_d1_database.bm.id
}
