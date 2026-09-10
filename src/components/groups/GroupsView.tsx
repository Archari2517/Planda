import React, { useState, useRef } from 'react';
import { 
  Plus, 
  Users, 
  UserPlus, 
  Settings, 
  X as IconClose, 
  Search, 
  AlertCircle, 
  UserCheck, 
  Image as ImageIcon, 
  Upload, 
  Link as LinkIcon 
} from 'lucide-react';

// --- Types ---
interface GroupMember {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  members: GroupMember[];
}

interface Task {
  id: string;
  title: string;
  assignedTo?: string;
}

// --- Helper Components ---
const MemberAvatar: React.FC<{ name: string; email: string; avatarUrl?: string }> = ({ name, avatarUrl }) => (
  <div className="w-8 h-8 rounded-full bg-amber-200 border border-black flex items-center justify-center overflow-hidden font-bold text-xs shrink-0">
    {avatarUrl ? (
      <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
    ) : (
      name.charAt(0).toUpperCase()
    )}
  </div>
);

const GroupAvatar: React.FC<{ name: string; imageUrl?: string }> = ({ name, imageUrl }) => (
  <div className="w-full h-full flex items-center justify-center bg-amber-300 font-black text-2xl text-black">
    {imageUrl ? (
      <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
    ) : (
      name.charAt(0).toUpperCase()
    )}
  </div>
);

// --- Main Component ---
export const GroupsView: React.FC = () => {
  // States
  const [groups, setGroups] = useState<Group[]>([
    {
      id: 'g1',
      name: 'ทีมพัฒนาเว็บไซต์',
      description: 'กลุ่มสำหรับโปรเจกต์พัฒนาเว็บแอปพลิเคชัน',
      members: [
        { id: 'u1', name: 'Alex', email: 'alex@example.com' },
        { id: 'u2', name: 'Sarah', email: 'sarah@example.com' },
      ],
    },
  ]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(groups[0] || null);
  
  // Modal States
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showGroupImageModal, setShowGroupImageModal] = useState(false);

  // Form States
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Search & Invite States
  const [searchEmail, setSearchEmail] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundUser, setFoundUser] = useState<GroupMember | null>(null);

  // Image Upload States
  const [tempGroupImageUrl, setTempGroupImageUrl] = useState('');
  const [pendingGroupImageUrl, setPendingGroupImageUrl] = useState<string | undefined>('');
  const [isSavingGroupImage, setIsSavingGroupImage] = useState(false);
  const groupImageFileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const newGroup: Group = {
      id: Date.now().toString(),
      name: newGroupName,
      description: newGroupDesc,
      members: [],
    };
    setGroups([...groups, newGroup]);
    setSelectedGroup(newGroup);
    setNewGroupName('');
    setNewGroupDesc('');
    setShowCreateGroupModal(false);
  };

  const handleSearchUser = () => {
    if (!searchEmail.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setFoundUser(null);

    // จำลองการค้นหาข้อมูล
    setTimeout(() => {
      if (searchEmail.includes('@')) {
        setFoundUser({
          id: Date.now().toString(),
          name: searchEmail.split('@')[0],
          email: searchEmail,
        });
      } else {
        setSearchError('ไม่พบผู้ใช้งานด้วยอีเมลนี้');
      }
      setIsSearching(false);
    }, 600);
  };

  const handleConfirmInvite = () => {
    if (!foundUser || !selectedGroup) return;
    const updatedGroup = {
      ...selectedGroup,
      members: [...selectedGroup.members, foundUser],
    };
    setSelectedGroup(updatedGroup);
    setGroups(groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)));
    setSearchEmail('');
    setFoundUser(null);
    setShowInviteModal(false);
  };

  const handleGroupImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingGroupImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyGroupImageUrl = () => {
    if (tempGroupImageUrl.trim()) {
      setPendingGroupImageUrl(tempGroupImageUrl.trim());
    }
  };

  const handleConfirmGroupImage = () => {
    if (!selectedGroup) return;
    setIsSavingGroupImage(true);
    setTimeout(() => {
      const updatedGroup = { ...selectedGroup, imageUrl: pendingGroupImageUrl };
      setSelectedGroup(updatedGroup);
      setGroups(groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)));
      setIsSavingGroupImage(false);
      setShowGroupImageModal(false);
    }, 400);
  };

  const handleRemoveGroupImage = () => {
    if (!selectedGroup) return;
    setIsSavingGroupImage(true);
    setTimeout(() => {
      const updatedGroup = { ...selectedGroup, imageUrl: undefined };
      setSelectedGroup(updatedGroup);
      setGroups(groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g)));
      setPendingGroupImageUrl(undefined);
      setIsSavingGroupImage(false);
      setShowGroupImageModal(false);
    }, 400);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex justify-between items-center border-b-4 border-black pb-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Users className="w-7 h-7" /> จัดการกลุ่ม (Groups)
          </h1>
          <p className="text-xs font-bold text-gray-600">บริหารจัดการสมาชิกและภาระงานในกลุ่มของคุณ</p>
        </div>
        <button
          onClick={() => setShowCreateGroupModal(true)}
          className="bg-accent px-4 py-2 border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all flex items-center gap-1.5 text-xs"
        >
          <Plus className="w-4 h-4 stroke-[3]" /> สร้างกลุ่มใหม่
        </button>
      </div>

      {/* Main Content Area */}
      {selectedGroup ? (
        <div className="bg-white border-2 border-black rounded-2xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-6">
          {/* Group Details Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-4">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-16 h-16 rounded-2xl border-2 border-black overflow-hidden shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <GroupAvatar name={selectedGroup.name} imageUrl={selectedGroup.imageUrl} />
                </div>
                <button
                  onClick={() => {
                    setPendingGroupImageUrl(selectedGroup.imageUrl);
                    setTempGroupImageUrl('');
                    setShowGroupImageModal(true);
                  }}
                  className="absolute -bottom-1 -right-1 bg-white p-1 rounded-lg border border-black shadow-sm hover:bg-amber-100"
                  title="เปลี่ยนรูปกลุ่ม"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <h2 className="text-xl font-extrabold">{selectedGroup.name}</h2>
                <p className="text-xs text-gray-600 font-medium">{selectedGroup.description || 'ไม่มีคำอธิบายกลุ่ม'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-2 bg-emerald-300 border-2 border-black rounded-xl text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-400 flex items-center gap-1"
              >
                <UserPlus className="w-4 h-4" /> เชิญสมาชิก
              </button>
            </div>
          </div>

          {/* Members Section */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-700">
              สมาชิกในกลุ่ม ({selectedGroup.members.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {selectedGroup.members.map((member) => (
                <div key={member.id} className="p-3 border-2 border-black rounded-xl flex items-center gap-3 bg-amber-50">
                  <MemberAvatar name={member.name} email={member.email} avatarUrl={member.avatarUrl} />
                  <div className="overflow-hidden">
                    <p className="font-black text-xs truncate">{member.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{member.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-black rounded-2xl">
          <p className="font-bold text-gray-500">ยังไม่ได้เลือกกลุ่ม หรือยังไม่มีกลุ่ม</p>
        </div>
      )}

      {/* --- Modals --- */}

      {/* Modal 1: สร้างกลุ่มใหม่ */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-black text-lg">สร้างกลุ่มใหม่</h3>
              <button onClick={() => setShowCreateGroupModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block mb-1">ชื่อกลุ่ม *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ทีมการตลาด"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full p-2.5 border-2 border-black rounded-xl focus:outline-none focus:bg-amber-50"
                />
              </div>
              <div>
                <label className="block mb-1">คำอธิบาย</label>
                <textarea
                  rows={3}
                  placeholder="รายละเอียดกลุ่มเบื้องต้น..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full p-2.5 border-2 border-black rounded-xl focus:outline-none focus:bg-amber-50"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-accent border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5"
                >
                  สร้างกลุ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: แก้ไขงาน */}
      {showEditTaskModal && editingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-black text-lg">แก้ไขรายละเอียดงาน</h3>
              <button onClick={() => setShowEditTaskModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowEditTaskModal(false);
              }}
              className="space-y-4 text-xs font-bold"
            >
              <div>
                <label className="block mb-1">ชื่อภาระงาน *</label>
                <input
                  type="text"
                  required
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full p-2.5 border-2 border-black rounded-xl focus:outline-none focus:bg-amber-50"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditTaskModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-accent border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: เชิญสมาชิกเข้าร่วมกลุ่ม */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-black" />
                เชิญเพื่อนเข้าร่วมกลุ่ม
              </h3>
              <button
                onClick={() => {
                  setSearchEmail('');
                  setFoundUser(null);
                  setSearchError(null);
                  setShowInviteModal(false);
                }}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-bold">
              <div>
                <label className="block mb-1 text-gray-700">ค้นหาด้วยอีเมล (Email) *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="email"
                      placeholder="example@email.com"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                      className="w-full pl-9 pr-3 py-2 border-2 border-black rounded-xl focus:outline-none focus:bg-amber-50"
                    />
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  <button
                    type="button"
                    onClick={handleSearchUser}
                    className="px-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800"
                  >
                    ค้นหา
                  </button>
                </div>
              </div>

              {isSearching && (
                <div className="text-center py-4 text-gray-500 font-medium">
                  กำลังค้นหาผู้ใช้งาน...
                </div>
              )}

              {searchError && !isSearching && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{searchError}</span>
                </div>
              )}

              {foundUser && !isSearching && (
                <div className="bg-emerald-50 border-2 border-emerald-500 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={foundUser.name} email={foundUser.email} avatarUrl={foundUser.avatarUrl} />
                    <div>
                      <p className="font-black text-black">{foundUser.name}</p>
                      <p className="text-[10px] text-gray-500 font-medium">{foundUser.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleConfirmInvite}
                    className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-600 transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    เพิ่มเข้ากลุ่ม
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchEmail('');
                    setFoundUser(null);
                    setSearchError(null);
                    setShowInviteModal(false);
                  }}
                  className="w-full py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: เปลี่ยนภาพกลุ่ม (Group Image Modal) */}
      {showGroupImageModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-black" />
                เปลี่ยนภาพกลุ่ม
              </h3>
              <button
                onClick={() => setShowGroupImageModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-bold">
              <input
                type="file"
                ref={groupImageFileInputRef}
                onChange={handleGroupImageFileUpload}
                accept="image/*"
                className="hidden"
              />

              {/* ส่วนพรีวิวรูปภาพ */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-24 h-24 rounded-2xl bg-amber-200 border-2 border-black flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                  <GroupAvatar
                    name={selectedGroup?.name || ''}
                    imageUrl={pendingGroupImageUrl || selectedGroup?.imageUrl}
                  />
                </div>
                <span className="text-[11px] text-gray-500 font-medium">ตัวอย่างภาพที่จะแสดง</span>
              </div>

              {/* ตัวเลือกที่ 1: เลือกไฟล์จากเครื่อง */}
              <button
                type="button"
                onClick={() => groupImageFileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-amber-300 border-2 border-black rounded-xl font-extrabold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4 stroke-[2.5]" /> อัปโหลดรูปภาพใหม่จากเครื่อง
              </button>

              <div className="flex items-center gap-2">
                <div className="h-[2px] bg-black/10 flex-1" />
                <span className="text-[10px] font-black uppercase text-gray-400">หรือ</span>
                <div className="h-[2px] bg-black/10 flex-1" />
              </div>

              {/* ตัวเลือกที่ 2: วาง URL */}
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  ระบุ URL รูปภาพ
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={tempGroupImageUrl}
                    onChange={(e) => setTempGroupImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyGroupImageUrl();
                      }
                    }}
                    className="flex-1 p-2 border-2 border-black rounded-xl text-xs font-semibold bg-white"
                  />
                  <button
                    type="button"
                    disabled={!tempGroupImageUrl.trim()}
                    onClick={handleApplyGroupImageUrl}
                    className="px-3 bg-black text-white rounded-xl font-bold text-xs hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
                  >
                    <LinkIcon className="w-3.5 h-3.5" /> แสดงตัวอย่าง
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGroupImageModal(false)}
                    className="flex-1 py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={isSavingGroupImage || !pendingGroupImageUrl}
                    onClick={handleConfirmGroupImage}
                    className="flex-1 py-2.5 bg-amber-400 border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
                  >
                    {isSavingGroupImage ? 'กำลังบันทึก...' : 'บันทึกรูปภาพ'}
                  </button>
                </div>

                {selectedGroup?.imageUrl && (
                  <button
                    type="button"
                    disabled={isSavingGroupImage}
                    onClick={handleRemoveGroupImage}
                    className="w-full py-2 text-red-500 font-bold hover:underline text-center text-xs"
                  >
                    ใช้รูปภาพเริ่มต้นของระบบ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};