import express from 'express'
import { getProduct, getProducts, createProduct, updateProduct, deleteProduct } from '../controllers/products.js';

const productRouter = express.Router();

productRouter.get('/', getProducts);

productRouter.get('/:id', getProduct);

productRouter.post('/', createProduct);

productRouter.put('/:id', updateProduct);

productRouter.delete('/:id', deleteProduct);

export default productRouter;