"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { AssetsProvider, useAssets } from "@/features/assets";
import AssetTable from "@/features/assets/components/AssetTable";
import AssetDrawer from "@/features/assets/components/AssetDrawer";
import AddAssetModal from "@/features/assets/components/AddAssetModal";

import ModuleHeader from "@/components/common/ModuleHeader";
import ModuleTabs from "@/components/common/ModuleTabs";
import SearchInput from "@/components/common/SearchInput";
import Button from "@/components/ui/Button";

type FilterMode = "all" | "in_use" | "maintenance" | "damaged";

function AssetsPageContent() {
  const { assets } = useAssets();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const tabs = [
    { id: "all", label: "All Assets" },
    { id: "available", label: "Available" },
    { id: "in_use", label: "In Use" },
    { id: "maintenance", label: "Maintenance" },
    { id: "damaged", label: "Damaged" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <ModuleHeader 
        title="Company Assets"
        count={assets.length}
        rightContent={(
          <>
            <SearchInput 
              value={searchQuery} 
              onChange={setSearchQuery} 
              placeholder="Search by name, SN, owner..." 
              width={180}
            />
            <Button 
              variant="primary" 
              size="sm" 
              icon={Plus}
              onClick={() => setShowAddModal(true)}
            >
              REGISTER ASSET
            </Button>
          </>
        )}
      />

      <ModuleTabs 
        tabs={tabs}
        activeTab={filterMode}
        onTabChange={(id) => setFilterMode(id as FilterMode)}
        background="bg-[#faf5f5]"
      />

      <div className="flex-1 overflow-hidden bg-background">
        <AssetTable filterMode={filterMode} searchQuery={searchQuery} onSelectAsset={setSelectedAssetId} />
      </div>

      {selectedAssetId && <AssetDrawer assetId={selectedAssetId} onClose={() => setSelectedAssetId(null)} />}
      {showAddModal && <AddAssetModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

import { MembersProvider } from "@/features/members/context/MembersContext";

export default function AssetsPage() {
  return (
    <MembersProvider>
      <AssetsProvider>
        <AssetsPageContent />
      </AssetsProvider>
    </MembersProvider>
  );
}
