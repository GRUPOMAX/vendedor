
//inserir----------------------------
require(__DIR__ . DIRECTORY_SEPARATOR . 'WebserviceClient.php');
$host = 'https://SEU_DOMINIO/webservice/v1';
$token = '6:4dacdb8e47193e8cbbabe508c3c59b4547e463817b1d9b9a1d20ab4812fe1a62';//token gerado no cadastro do usuario (verificar permissões)
$selfSigned = true; //true para certificado auto assinado
$api = new IXCsoft\WebserviceClient($host, $token, $selfSigned);
$dados = array(
    'id_fornecedor' => '',
    'data_emissao' => '',
    'data_vencimento' => '',
    'valor' => '',
    'id_contas' => '',
    'tipo_pagamento' => '',
    'id_dado_bancario' => '',
    'tipo_pix' => '',
    'chave_pix' => '',
    'codigo_barras' => '',
    'documento' => '',
    'numero_nota' => '',
    'id_conta' => '',
    'filial_id' => '',
    'previsao' => 'N',
    'eh_despesa_veiculo' => 'N',
    'obs' => '',
    'id_entrada' => '0',
    'status' => 'A',
    'status_auditoria' => 'N',
    'liberado' => 'S',
    'tipo_conta' => '',
    'duplicata' => '',
    'lote' => '',
    'previsao_conta_despesa' => 'N',
    'id_conta_class_finan_a' => '',
    'id_despesa_veiculo' => '',
    'centro_custo_regra_criterio' => 'CE',
    'id_centro_custo_criterio_rateio' => '',
    'id_centro_custo_rel_centro_custo_categoria' => '',
    'valor_aberto' => '',
    'valor_pago' => '',
    'data_pagamento' => '',
    'debito_data' => '',
    'valor_total_pago' => '0.00',
    'valor_cancelado' => '',
    'data_cancelamento' => '',
    'id_mot_cancelamento' => '',
    'id_lote_pagamento' => '',
    'id_remessa_pagamento' => '',
    'comunicado' => 'N',
    'estornado' => '',
    'id_lote_importacao' => '',
    'conta_pagamento' => '',
    'botoes_classe_finan' => '',
    'id_conta_class_finan' => '',
    'valor_class_finan' => '',
    'grid_classe_finan' => '',
    'json_class_finan' => ''
);
$api->post('fn_apagar', $dados);
$retorno = $api->getRespostaConteudo(false);// false para json | true para array
?>

//editar-----------------------------
require(__DIR__ . DIRECTORY_SEPARATOR . 'WebserviceClient.php');
$host = 'https://SEU_DOMINIO/webservice/v1';
$token = '6:4dacdb8e47193e8cbbabe508c3c59b4547e463817b1d9b9a1d20ab4812fe1a62';//token gerado no cadastro do usuario (verificar permissões)
$selfSigned = true; //true para certificado auto assinado
$api = new IXCsoft\WebserviceClient($host, $token, $selfSigned);
$dados = array(
    'id_fornecedor' => '',
    'data_emissao' => '',
    'data_vencimento' => '',
    'valor' => '',
    'id_contas' => '',
    'tipo_pagamento' => '',
    'id_dado_bancario' => '',
    'tipo_pix' => '',
    'chave_pix' => '',
    'codigo_barras' => '',
    'documento' => '',
    'numero_nota' => '',
    'id_conta' => '',
    'filial_id' => '',
    'previsao' => 'N',
    'eh_despesa_veiculo' => 'N',
    'obs' => '',
    'id_entrada' => '0',
    'status' => 'A',
    'status_auditoria' => 'N',
    'liberado' => 'S',
    'tipo_conta' => '',
    'duplicata' => '',
    'lote' => '',
    'previsao_conta_despesa' => 'N',
    'id_conta_class_finan_a' => '',
    'id_despesa_veiculo' => '',
    'centro_custo_regra_criterio' => 'CE',
    'id_centro_custo_criterio_rateio' => '',
    'id_centro_custo_rel_centro_custo_categoria' => '',
    'valor_aberto' => '',
    'valor_pago' => '',
    'data_pagamento' => '',
    'debito_data' => '',
    'valor_total_pago' => '0.00',
    'valor_cancelado' => '',
    'data_cancelamento' => '',
    'id_mot_cancelamento' => '',
    'id_lote_pagamento' => '',
    'id_remessa_pagamento' => '',
    'comunicado' => 'N',
    'estornado' => '',
    'id_lote_importacao' => '',
    'conta_pagamento' => '',
    'botoes_classe_finan' => '',
    'id_conta_class_finan' => '',
    'valor_class_finan' => '',
    'grid_classe_finan' => '',
    'json_class_finan' => ''
);
$registro = '1';//registro a ser editado
$api->put('fn_apagar', $dados, $registro);
$retorno = $api->getRespostaConteudo(false);// false para json | true para array


//deletar-----------------------------
require(__DIR__ . DIRECTORY_SEPARATOR . 'WebserviceClient.php');
$host = 'https://SEU_DOMINIO/webservice/v1';
$token = '6:4dacdb8e47193e8cbbabe508c3c59b4547e463817b1d9b9a1d20ab4812fe1a62';//token gerado no cadastro do usuario (verificar permissões)
$selfSigned = true; //true para certificado auto assinado
$api = new IXCsoft\WebserviceClient($host, $token, $selfSigned);
$registro = '1';//registro a ser deletado
$api->delete('fn_apagar', $registro);
$retorno = $api->getRespostaConteudo(false);// false para json | true para array


//listar-----------------------------
require(__DIR__ . DIRECTORY_SEPARATOR . 'WebserviceClient.php');
$host = 'https://SEU_DOMINIO/webservice/v1';
$token = '6:4dacdb8e47193e8cbbabe508c3c59b4547e463817b1d9b9a1d20ab4812fe1a62';//token gerado no cadastro do usuario (verificar permissões)
$selfSigned = true; //true para certificado auto assinado
$api = new IXCsoft\WebserviceClient($host, $token, $selfSigned);
$params = array(
    'qtype' => 'fn_apagar.id',//campo de filtro
    'query' => '1',//valor para consultar
    'oper' => '=',//operador da consulta
    'page' => '1',//página a ser mostrada
    'rp' => '20',//quantidade de registros por página
    'sortname' => 'fn_apagar.id',//campo para ordenar a consulta
    'sortorder' => 'desc'//ordenação (asc= crescente | desc=decrescente)
);
$api->get('fn_apagar', $params);
$retorno = $api->getRespostaConteudo(false);// false para json | true para array
                    