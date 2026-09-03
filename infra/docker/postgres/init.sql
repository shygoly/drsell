-- Runs only on first postgres init
-- 本地开发占位密码：与 docker-compose 的 DRSELL_DB_PASSWORD 默认值保持一致，生产密码绝不入库
CREATE USER drsell_app WITH PASSWORD 'ChangeMeLocalDb2026' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE drsell OWNER drsell_app;
\c drsell
GRANT ALL ON SCHEMA public TO drsell_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO drsell_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO drsell_app;
