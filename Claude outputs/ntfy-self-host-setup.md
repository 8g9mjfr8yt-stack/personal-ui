# Self-hosted ntfy na Hetzneri — postup na spustenie na serveri

Spúšťaj priamo na Hetzner serveri: `ssh root@88.99.226.58`, potom `cd ~/n8n`
(rovnaký priečinok, kde beží existujúci `compose.yml`/`docker-compose.yml` a kontajnery
`n8n-n8n-1`, `n8n-runners-1`, `n8n-cloudflared-1` — sieť `n8n_default`).

Topic, ktorý budeme používať: **`briefing`** (meno teraz už nemusí byť tajné, lebo
prístup bude chránený tokenom, nie len názvom).

---

## Krok 1 — over si aktuálny compose súbor

```bash
ls ~/n8n
cat ~/n8n/compose.yml 2>/dev/null || cat ~/n8n/docker-compose.yml
```

Zisti presný názov súboru (ďalej ho volám `compose.yml`) a uisti sa, že v ňom
je sekcia `services:` na najvyššej úrovni — pod ňu pridáš nový blok nižšie.

## Krok 2 — pridaj ntfy službu do compose súboru

Otvor súbor (`nano ~/n8n/compose.yml`) a pod `services:` pridaj (rovnaké odsadenie
ako majú ostatné služby, napr. `n8n:`):

```yaml
  ntfy:
    image: binwiederhier/ntfy
    container_name: n8n-ntfy-1
    command: serve
    environment:
      - NTFY_BASE_URL=https://ntfy.totojemoja.site
      - NTFY_AUTH_FILE=/var/lib/ntfy/auth.db
      - NTFY_AUTH_DEFAULT_ACCESS=deny-all
      - NTFY_CACHE_FILE=/var/lib/ntfy/cache.db
      - NTFY_ENABLE_SIGNUP=false
      - NTFY_ENABLE_LOGIN=true
      - NTFY_BEHIND_PROXY=true
    volumes:
      - ./ntfy-data:/var/lib/ntfy
    restart: unless-stopped
```

Poznámky:
- `NTFY_AUTH_DEFAULT_ACCESS=deny-all` — nikto bez explicitného práva (krok 4) sa
  ani nepozrie na žiadny topic. Toto je hlavný bezpečnostný prepínač.
- Žiadny `ports:` blok netreba — dnu sa pristupuje len cez Docker sieť
  `n8n_default` (kontajner `ntfy`), von ide všetko cez Cloudflare Tunnel (krok 5).
- `NTFY_BEHIND_PROXY=true` — správne číta klientovu IP z tunela (rate-limity).

Ulož a over, že je validný YAML:

```bash
mkdir -p ~/n8n/ntfy-data
docker compose config -q && echo "YAML OK"
```

## Krok 3 — spusti kontajner

```bash
docker compose up -d ntfy
docker compose ps ntfy
docker logs n8n-ntfy-1 --tail 30
```

Over, že beží a je v sieti `n8n_default`:

```bash
docker network inspect n8n_default | grep -A2 ntfy
```

## Krok 4 — vytvor usera pre n8n (publisher) a usera pre teba (subscriber) + ACL

Dvaja useri s minimálnymi právami — n8n vie na topic **len písať**, appka na
telefóne/Macu ho vie **len čítať**:

```bash
# admin heslo pre teba (na prihlásenie do web UI ntfy, ak by si ho niekedy chcel) - vynechateľné
# docker exec -it n8n-ntfy-1 ntfy user add --role=admin michal

docker exec -it n8n-ntfy-1 ntfy user add --role=user n8n-publisher
docker exec -it n8n-ntfy-1 ntfy user add --role=user michal-phone

docker exec -it n8n-ntfy-1 ntfy access n8n-publisher briefing write-only
docker exec -it n8n-ntfy-1 ntfy access michal-phone briefing read-only

# tokeny (bez expirácie je jednoduchšie na údržbu; over výpisom nižšie)
docker exec -it n8n-ntfy-1 ntfy token add n8n-publisher
docker exec -it n8n-ntfy-1 ntfy token add michal-phone

docker exec -it n8n-ntfy-1 ntfy user list
```

Pri `user add` ťa vyzve na heslo pre daného usera — vymysli si ľubovoľné (heslá
sa aj tak nebudú bežne používať, appka aj n8n budú používať token nižšie).
**Skopíruj si oba vypísané tokeny (`tk_...`) — jeden pošli mne** (pre n8n workflow),
**druhý si nechaj pre appku na telefóne/Macu**.

## Krok 5 — sprístupni ntfy verejne cez Cloudflare Tunnel

Toto sa skús urobiť ja cez Cloudflare dashboard v prehliadači (ak sa tam viem
prihlásiť) — pridám public hostname `ntfy.totojemoja.site` → `http://ntfy:80`
v rámci existujúceho tunela. Ak sa mi to z nejakého dôvodu nepodarí, návod
manuálne:

1. Choď na `https://one.dash.cloudflare.com` → **Networks → Tunnels**
2. Otvor existujúci tunel (ten, čo používa `n8n.totojemoja.site`)
3. **Public Hostname → Add a public hostname**
   - Subdomain: `ntfy`
   - Domain: `totojemoja.site`
   - Service Type: `HTTP`
   - URL: `ntfy:80` (meno kontajnera/služby z compose, port 80 — interný ntfy port)
4. Ulož. O pár sekúnd by malo byť `https://ntfy.totojemoja.site` funkčné.

## Krok 6 — over funkčnosť (spusti na serveri, alebo kdekoľvek s internetom)

```bash
# publish s tokenom n8n-publisher (nahraď TOKEN)
curl -H "Authorization: Bearer TOKEN_N8N_PUBLISHER" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '{"topic":"briefing","title":"Ranný briefing","message":"Test diakritiky: žltý kôň nesie ťažký úľ"}' \
     https://ntfy.totojemoja.site/

# skús to isté BEZ tokenu — musí vrátiť 401/403
curl -i -d '{"topic":"briefing","title":"test","message":"test"}' \
     https://ntfy.totojemoja.site/
```

Ak prvý príkaz pošle notifikáciu so správnou diakritikou a druhý zlyhá s
401/403, je hotovo — napíš mi, doladím n8n workflow a dám ti presný postup
pre appku na telefóne.

---

*Topic `denny-agent-4085389eb4f3` na verejnom ntfy.sh môžeš po prechode na
self-hosted riešenie prestať používať (appku môžeš z neho odhlásiť).*
