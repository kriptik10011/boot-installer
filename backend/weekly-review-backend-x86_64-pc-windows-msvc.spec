# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all recipe-scrapers submodules (561 site-specific scrapers)
# These are dynamically imported at runtime based on URL domain
recipe_scrapers_imports = collect_submodules('recipe_scrapers')

# Collect extruct submodules (recipe-scrapers dependency for schema.org/JSON-LD)
extruct_imports = collect_submodules('extruct')

# Collect data files needed by dependencies
extruct_datas = collect_data_files('extruct')
mf2py_datas = collect_data_files('mf2py')
certifi_datas = collect_data_files('certifi')  # SSL CA certificates for HTTPS requests

a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=mf2py_datas + extruct_datas + certifi_datas,
    hiddenimports=[
        'mf2py',
        'extruct',
        'platformdirs',
        # recipe-scrapers and dependencies
        'recipe_scrapers',
        'recipe_scrapers._exceptions',
        'isodate',
        'w3lib',
        # uvicorn internals
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.http.flow_control',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # uvicorn dependencies
        'h11',
        'httptools',
        'click',
        'colorama',
        # Python stdlib (explicit for frozen exe)
        'logging.config',
        'logging.handlers',
        # SQLAlchemy
        'sqlalchemy.sql.default_comparator',
        # Rate limiting
        'slowapi',
        # Password hashing (auth/pin.py)
        'argon2',
        'argon2.exceptions',
        'argon2._password_hasher',
        '_argon2_cffi_bindings',
        # Encrypted database (db/encrypted_database.py)
        'sqlcipher3',
        'sqlcipher3.dbapi2',
        # Date utilities (finance services)
        'dateutil',
        'dateutil.relativedelta',
        # HTTP client (recipe scraping)
        'httpx',
        'httpcore',
        'anyio',
        'sniffio',
        # File uploads (backup, CSV, ICS)
        'multipart',
    ] + recipe_scrapers_imports + extruct_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='weekly-review-backend-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
