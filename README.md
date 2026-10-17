# Education Center

Tədris mərkəzləri üçün idarəetmə sistemi: filiallar, qruplar, cədvəl, dərslər, davamiyyət, imtahanlar, ödənişlər, hesabatlar. Rollar: admin, müəllim, şagird, valideyn.

Bir quraşdırma çox mərkəzə xidmət edir:
- **Mərkəz** öz domenində açılır.
- **Məlumat:** hər mərkəzin öz bazası var (`<DB_NAME>_t<id>`).
- **Giriş token-i** yalnız verildiyi mərkəzdə keçərlidir.

| Hissə | Texnologiya |
|---|---|
| `backend/` | Go (gin, gorm), PostgreSQL |
| `frontend/` | Next.js 14, Tailwind |

## Serverə qurmaq (avtomatik yeniləmə ilə)

Təzə Ubuntu serverində root kimi işə salın:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/oawocom/education-center/main/deploy/install.sh)
```

Skript bunları edir:
- Docker-i qurur;
- repo-nu `/home/education-center`-ə köçürür, nginx və HTTPS (Let's Encrypt) qurur;
- domeni, super adminin e-poçtunu və parolunu soruşur, `.env`-i yaradır;
- tətbiqi işə salır.

`main` budağına edilən hər push bir neçə dəqiqəyə serverə özü gəlir (`deploy/update.sh`, hər dəqiqə). Gedişatı `journalctl -u education-center-update` göstərir.

Super admin panelində əlavə edilən hər domen üçün nginx saytı və HTTPS sertifikatı da avtomatik qurulur (`deploy/domains.sh`). Bunun üçün domenin DNS-i (A qeydi) bu serverə yönəlməlidir. Sertifikat alınmasa, bir saatdan sonra yenidən cəhd edilir.

## İşə salmaq

```bash
cp .env.example .env      # parolları və JWT_SECRET-i doldurun
docker compose up -d --build
```

Veb tətbiq `127.0.0.1:3000`-də açılır. Qarşısına HTTPS ilə nginx qoyun. Bütün domenlər (mərkəzlərin domenləri və super admin ünvanı) eyni yerə yönəlir:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 32m;
}
```

## Mərkəz yaratmaq

1. `https://<SUPER_HOST>/super` ünvanını açın. İlk super admin `.env`-dəki `SUPERADMIN_EMAIL` və `SUPERADMIN_PASSWORD`-dan yaranır.
2. "Yeni mərkəz" düyməsini basın və bunları yazın:
   - mərkəzin adı;
   - domenləri;
   - ilk adminin adı, e-poçtu və parolu.

   Mərkəzin bazası, cədvəlləri və ilkin sorğu kitabçaları avtomatik yaranır.
3. Domenin DNS-ini serverə yönəldin. Mərkəzin admini `https://<domen>/login` ünvanında daxil olur.

Super admin paneldən mərkəzi dayandırmaq, domenlərini dəyişmək və istifadəçiyə yeni parol vermək olar.

## Köhnə quraşdırmadan məlumat köçürmək

1. Paneldə tenant yaradın. Bazanın adı kartda görünür, məsələn `educenter_t1`.
2. Köhnə serverdə dump çıxarın:

   ```bash
   pg_dump --no-owner --no-privileges -t 'edu_*' <köhnə baza> | gzip > edu.sql.gz
   ```

3. Dump-ı bu serverə köçürün, məsələn `scp` ilə `/root/migrate/`-ə.
4. Bu serverdə işə salın:

   ```bash
   deploy/import.sh educenter_t1 /root/migrate/edu.sql.gz
   ```

Skript tenantın indiki bazasını əvvəlcə `/root/migrate/` qovluğunda saxlayır, sonra köhnə məlumatla əvəz edir və backend-i yenidən başladır.

İlk sorğuda server cədvəlləri yeniləyir və istifadəçiləri bu tenanta bağlayır: köhnə `project_id` sütunu `tenant_id` olur. İstifadəçilərin köhnə parolları işləməyə davam edir.

## Testlər

```bash
cd backend && go test ./...    # PostgreSQL lazımdır: TEST_DATABASE_URL
```
