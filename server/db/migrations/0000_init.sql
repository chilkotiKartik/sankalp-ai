CREATE TABLE "announcements" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"district" text,
	"created_at" timestamp with time zone,
	CONSTRAINT "announcements_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" integer NOT NULL,
	"hash" text,
	"prev_hash" text,
	CONSTRAINT "audit_log_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"department_id" text NOT NULL,
	CONSTRAINT "categories_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "complaint_events" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complaint_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "complaint_events_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"district" text,
	"category" text,
	"department_id" text,
	"priority" text,
	"created_at" timestamp with time zone NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"user_id" text,
	CONSTRAINT "complaints_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "consents_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_id" text,
	"kind" text,
	"visibility" text,
	CONSTRAINT "media_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "police_stations" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"district" text,
	"lat" double precision,
	"lng" double precision,
	CONSTRAINT "police_stations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "proofs" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complaint_id" text NOT NULL,
	CONSTRAINT "proofs_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "records" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"collection" text NOT NULL,
	CONSTRAINT "records_tenant_id_collection_id_pk" PRIMARY KEY("tenant_id","collection","id")
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text,
	CONSTRAINT "review_tasks_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rti_requests" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text,
	"district" text,
	CONSTRAINT "rti_requests_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sos_contacts" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "sos_contacts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sos_events" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"district" text,
	"category" text,
	"user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"lat" double precision,
	"lng" double precision,
	CONSTRAINT "sos_events_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone" text NOT NULL,
	"role" text NOT NULL,
	"district" text,
	CONSTRAINT "users_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complaint_id" text NOT NULL,
	"decision" text,
	CONSTRAINT "verifications_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "worker_locations" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"district" text,
	"status" text,
	CONSTRAINT "workers_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE INDEX "announcements_tenant_created" ON "announcements" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_tenant_seq" ON "audit_log" USING btree ("tenant_id","seq");--> statement-breakpoint
CREATE INDEX "complaint_events_complaint" ON "complaint_events" USING btree ("tenant_id","complaint_id");--> statement-breakpoint
CREATE INDEX "complaints_tenant_status" ON "complaints" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "complaints_tenant_created" ON "complaints" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "complaints_dept_status" ON "complaints" USING btree ("department_id","status");--> statement-breakpoint
CREATE INDEX "complaints_geo" ON "complaints" USING btree ("tenant_id","lat","lng");--> statement-breakpoint
CREATE INDEX "consents_user" ON "consents" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "police_stations_geo" ON "police_stations" USING btree ("tenant_id","lat","lng");--> statement-breakpoint
CREATE INDEX "rti_tenant_status" ON "rti_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "sos_tenant_status" ON "sos_events" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "sos_tenant_created" ON "sos_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "sos_geo" ON "sos_events" USING btree ("tenant_id","lat","lng");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_phone" ON "users" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "users_role" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "worker_locations_worker" ON "worker_locations" USING btree ("tenant_id","worker_id","at");