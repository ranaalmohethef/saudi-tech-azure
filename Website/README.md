# Diraya — Website

A searchable website for technology research across six Saudi universities.

The website supports two modes:

- **Saved-data mode:** displays the included dataset without a database connection.
- **Live mode:** reads records from PostgreSQL through a Flask API.

A label on the page indicates which data source is being used.

## 1. Main Files

| File or folder | Purpose |
|---|---|
| `server.py` | Flask server and PostgreSQL API |
| `requirements.txt` | Python dependencies |
| `.env.example` | Database configuration template |
| `.gitignore` | Excludes local credentials and Python cache files from Git |
| `test_connection.py` | Tests the PostgreSQL connection |
| `setup_stats.py` | Creates the source statistics table when needed |
| `sql/source_stats.sql` | Statistics table definition |
| `make_data_js.py` | Refreshes the saved dataset from PostgreSQL |
| `build_single.py` | Builds the bundled website |
| `diraya.html` | Bundled website for sharing and demonstration |
| `static/index.html` | Main page |
| `static/style.css` | Styling and layout |
| `static/app.js` | Search, filters, charts, and tables |
| `static/i18n.js` | Arabic and English interface text |
| `static/data.js` | Saved records, statistics, and metadata |
| `static/team/` | Team images |

## 2. Open Without a Server

Extract the project files, then open:

`static/index.html`

Alternatively, open `diraya.html` to use the bundled version.

Both options display the saved dataset. They do not automatically retrieve new database records.

## 3. Run with PostgreSQL

### Step 1: Open the Website Folder

In VS Code, select **File → Open Folder** and open the `Website` folder containing `server.py`.

Open **Terminal → New Terminal**.

### Step 2: Install Dependencies

```bash
python -m pip install -r requirements.txt
```

### Step 3: Configure the Database Connection

Copy `.env.example` to a new file named `.env` in the same folder.

Set the connection values:

```dotenv
PGHOST=your-server.postgres.database.azure.com
PGPORT=5432
PGDATABASE=research_hub
PGUSER=your_database_user
PGPASSWORD=your_database_password
```

Use the actual credentials for your environment. Do not commit the populated `.env` file to Git.

### Step 4: Check Database Access

Ensure that:

- The PostgreSQL server is running.
- The database and project tables already exist.
- The machine running Flask can reach the server.
- The database user has permission to read the required tables.

For a server using public access, ensure that its firewall permits your current client IP address.

### Step 5: Test the Connection

```bash
python test_connection.py
```

A successful connection displays:

```text
CONNECTED. research.final_dataset:
```

The output also lists the record counts by university.

### Step 6: Start the Website

```bash
python server.py
```

Open:

http://localhost:5000

Check that the page indicates **Live data from PostgreSQL**.

Keep the terminal open while using the website. Press **Ctrl+C** to stop the server.

The included server configuration is intended for local development and demonstration.

## 4. Data Sources Used by the Website

| Information | Database source |
|---|---|
| Research records | `research.final_dataset` |
| Cleaned and validated counts | `research.source_stats` |
| Latest quality-check result | `research.quality_checks` |
| Last data-loading time | `research.final_dataset.loaded_at` |

The browser accesses the Flask API rather than connecting directly to PostgreSQL.

The main endpoints are:

| Endpoint | Purpose |
|---|---|
| `/api/health` | Database connection check |
| `/api/papers/all` | Research records |
| `/api/stats` | Source statistics |
| `/api/meta` | Loading time and latest quality-check metadata |

If live records cannot be loaded, the website can display the included saved copy.

## 5. Refresh the Saved Dataset

After a successful Azure pipeline run, refresh the saved copy if you want the offline website to display the latest results.

Run these commands from the `Website` folder with database access configured:

```bash
python make_data_js.py --db
python build_single.py
```

The first command updates `static/data.js`.

The second rebuilds `diraya.html` using the current website files and saved data.

Reload the page after updating the files.

In live mode, reload the page to fetch the latest database records.

## 6. Source Statistics

Azure's `UpdateStats` activity updates `research.source_stats` after the quality check succeeds.

To create the statistics table when needed:

```bash
python setup_stats.py
```

This command preserves existing statistics.

It is not necessary to run it after each Azure pipeline run. Do not use a local Python `run_summary.json` to overwrite the Azure statistics.

## 7. Editing the Website

| Change | File |
|---|---|
| Colors, spacing, and layout | `static/style.css` |
| Arabic and English labels | `static/i18n.js` |
| Page sections and structure | `static/index.html` |
| Search, filters, charts, and table behavior | `static/app.js` |
| Database queries and API responses | `server.py` |
| Team images | `static/team/` |

After editing the website, rebuild the bundled version if you use it:

```bash
python build_single.py
```

## 8. Troubleshooting

| Issue | Action |
|---|---|
| `server.py` cannot be found | Open the terminal in the folder containing `server.py` |
| A Python module is missing | Run `python -m pip install -r requirements.txt` |
| Database settings are missing | Check that `.env` exists and contains the required values |
| Database connection fails | Run `python test_connection.py` and check credentials, server availability, and network access |
| The page shows the saved copy | Review the Flask terminal for connection or API errors |
| Offline results are outdated | Run `python make_data_js.py --db`, then `python build_single.py` |
| The bundled page does not reflect design changes | Run `python build_single.py` again |
| Port 5000 is already in use | Stop the previous local server before starting another instance |

## 9. Credentials and Sharing

- Keep database passwords in the local `.env` file.
- Share `.env.example` with placeholders, not the populated `.env`.
- `.gitignore` prevents untracked matching files from being added to Git; it does not remove files already committed.
- Share `diraya.html` for a bundled demonstration using saved data.
- Share the complete `Website` folder when handing over the source code.
- Live mode requires a running Flask server and access to the configured PostgreSQL database.
