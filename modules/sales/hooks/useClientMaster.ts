import { useState, useEffect } from 'react';
import { Company, Client } from '@/modules/shared/types';
import { SalesService } from '@/modules/sales/services/salesService';
import { toast } from 'sonner';
import { confirmModal } from '@/modules/shared/components/ConfirmDialog';

export const useClientMaster = (company: Company) => {
    const [clients, setClients] = useState<Client[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const initialForm: Partial<Client> = {
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        ntn: '',
        creditLimit: 0,
        status: 'Active'
    };

    const [formData, setFormData] = useState<Partial<Client>>(initialForm);

    const refreshData = () => {
        const all = SalesService.getClients().filter(c => c.company === company);
        setClients(all);
    };

    useEffect(() => {
        refreshData();
    }, [company]);

    const handleSave = () => {
        if (!formData.name || !formData.phone) {
            toast.error("Business Partner Name and Phone are required.");
            return;
        }

        const newClient: Client = {
            ...(formData as Client),
            id: `BP-${Date.now().toString().slice(-6)}`,
            company,
            createdAt: new Date().toISOString()
        };

        const all = SalesService.getClients();
        SalesService.saveClients([...all, newClient]);
        refreshData();
        setIsModalOpen(false);
        setFormData(initialForm);
        toast.success("Business Partner profile created.");
    };

    const handleDelete = async (id: string) => {
        if (await confirmModal("Delete this Business Partner profile?")) {
            const all = SalesService.getClients();
            SalesService.saveClients(all.filter(c => c.id !== id));
            refreshData();
            toast.success("Business Partner profile deleted.");
        }
    };

    const filteredClients = clients.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.ntn.includes(searchTerm)
    );

    return {
        clients,
        filteredClients,
        isModalOpen,
        setIsModalOpen,
        searchTerm,
        setSearchTerm,
        formData,
        setFormData,
        handleSave,
        handleDelete,
        initialForm
    };
};
