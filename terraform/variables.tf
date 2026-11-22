variable "account_id" {
  type        = string
  description = "Cloudflare account ID"
}

variable "workers_subdomain" {
  type        = string
  description = "Your account's workers.dev subdomain (used only for outputs)"
}

variable "worker_name" {
  type    = string
  default = "cf-bm"
}
