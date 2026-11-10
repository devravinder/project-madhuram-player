var DB_NAME = "madhuram";

function upsertRecord(COLLECTION_NAME, ID, partialData) {
  const request = indexedDB.open(DB_NAME);

  request.onerror = () => {
    console.error("❌ DB open failed:", request.error);
  };

  request.onsuccess = () => {
    const db = request.result;

    // Check if object store exists
    if (!db.objectStoreNames.contains(COLLECTION_NAME)) {
      console.error(`❌ Object store "${COLLECTION_NAME}" does not exist`);
      db.close();
      return;
    }

    const tx = db.transaction(COLLECTION_NAME, "readwrite");
    const store = tx.objectStore(COLLECTION_NAME);

    // UPSERT directly
    const record = {
      id: ID,
      ...partialData,
    };

    const putRequest = store.put(record);

    putRequest.onsuccess = () => {
      console.log("✅ Record upserted:", record);
    };

    putRequest.onerror = () => {
      console.error("❌ Put request failed:", putRequest.error);
    };

    tx.oncomplete = () => {
      console.log("✅ Transaction complete");
      db.close();
    };

    tx.onerror = () => {
      console.error("❌ Transaction failed:", tx.error);
    };
  };
}

function sum(a, b) {
  return a + b;
}

console.log(sum(5, 10)); // 15

// Test the upsert:
// upsertRecord("playlists", "8d85802ct", { name: "Whs", songIds: [] });
