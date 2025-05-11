import Opname from "../models/OpnameModel.js";
import Products from "../models/ProductModel.js";
import Users from "../models/UserModel.js";

export const getOpname = async (req, res) => {
    try {
        const response = await Opname.findAll({
            include: [
                {
                    model: Products,
                    attributes: ['nmbar']
                },
                {
                    model: Users,
                    attributes: ['name']
                }
            ],
            order: [['opname_id', 'DESC']]
        });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

export const getOpnameById = async (req, res) => {
    try {
        const response = await Opname.findOne({
            where: {
                opname_id: req.params.opname_id
            },
            include: [
                {
                    model: Products,
                    attributes: ['nmbar']
                },
                {
                    model: Users,
                    attributes: ['name']
                }
            ]
        });
        if (!response) return res.status(404).json({ msg: "Stock opname not found" });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ msg: error.message });
    }
};

export const createOpname = async (req, res) => {
    const { kdbar, stok_sistem, stok_fisik, keterangan } = req.body;
    try {
        const product = await Products.findByPk(kdbar);
        if (!product) return res.status(404).json({ msg: "Product not found" });

        const selisih = stok_fisik - stok_sistem;
        await Opname.create({
            kdbar,
            stok_sistem,
            stok_fisik,
            selisih,
            keterangan,
            user_id: req.userId // Assuming you have middleware that sets userId
        });
        res.status(201).json({ msg: "Stock opname created successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

export const updateOpname = async (req, res) => {
    const { kdbar, stok_sistem, stok_fisik, keterangan } = req.body;
    try {
        const opname = await Opname.findOne({
            where: {
                opname_id: req.params.opname_id
            }
        });
        if (!opname) return res.status(404).json({ msg: "Stock opname not found" });

        const selisih = stok_fisik - stok_sistem;
        await opname.update({
            kdbar,
            stok_sistem,
            stok_fisik,
            selisih,
            keterangan,
            user_id: req.userId
        });
        res.status(200).json({ msg: "Stock opname updated successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};

export const deleteOpname = async (req, res) => {
    try {
        const opname = await Opname.findOne({
            where: {
                opname_id: req.params.opname_id
            }
        });
        if (!opname) return res.status(404).json({ msg: "Stock opname not found" });

        await opname.destroy();
        res.status(200).json({ msg: "Stock opname deleted successfully" });
    } catch (error) {
        res.status(400).json({ msg: error.message });
    }
};
