import asyncio, json
from sqlalchemy import text
from app.db.session import AsyncSessionLocal, engine

async def main():
    async with AsyncSessionLocal() as s:
        row = (await s.execute(text("select * from shop_settings limit 1"))).mappings().first()
        print("SAVED:", json.dumps({k: str(v) for k, v in dict(row).items()}))
        await s.execute(text("delete from shop_settings"))
        await s.commit()
        print("deleted; rows now:", (await s.execute(text("select count(*) from shop_settings"))).scalar())
    await engine.dispose()
asyncio.run(main())
