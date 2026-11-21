# Tenant onboarding templates (P7.1)

Copy this folder, replace the example rows with the state's real data, then run:

```bash
npm run tenant:onboard -- --dir path/to/csvs --id kerala --name "Kerala" --state-label "Kerala" \
  --prefix KL --default-district "Thiruvananthapuram" --languages ml,en \
  --grievance-name "…" --grievance-email "…" --grievance-phone "…" --grievance-address "…"
```

The command validates everything with the same zod schema the server uses at boot, prints every problem with its file and row, and writes `config/tenants/<id>.json` only when the config is valid. The rows shipped here are **placeholders**: replace them, never deploy them.

| File | Columns |
|---|---|
| departments.csv | id, name, nameLocal, icon, color, helpline, slaHours, categories (`|`-separated) |
| districts.csv | district, lat, lng |
| wards.csv | name, number, area, district, lat, lng, pop |
| police_stations.csv | id, name, address, phone, lat, lng, ward, district |
| emergency_services.csv (optional) | id, type (police/hospital/fire/ambulance/disaster), name, district, address, phone, lat, lng |
